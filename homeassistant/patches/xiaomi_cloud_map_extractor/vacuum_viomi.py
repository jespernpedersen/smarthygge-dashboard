# SMARTHYGGE PATCH: the Mi Robot Vacuum-Mop P (viomi.vacuum.v8) uploads maps while cleaning that
# vacuum-map-parser-viomi 0.1.3 can't read past the "navigate" section ("magic check failed" / "buffer underrun").
# The tolerant parser keeps whatever parsed before the failure (map image, path, charger) and takes the vacuum
# position from the newest path point. Failing maps are saved to /config/smarthygge_viomi/ for a proper fix.
# Original file: vacuum_viomi.py.orig
import logging
import math
import os
import time
from typing import Self

from vacuum_map_parser_base.map_data import MapData, Point
from vacuum_map_parser_viomi.map_data_parser import ViomiMapDataParser
from vacuum_map_parser_viomi.parsing_buffer import ParsingBuffer
from .base.model import VacuumConfig, VacuumApi
from .base.vacuum_v2 import BaseXiaomiCloudVacuumV2

_LOGGER = logging.getLogger(__name__)
_RAW_DIR = "/config/smarthygge_viomi"


class TolerantViomiMapDataParser(ViomiMapDataParser):
    def parse(self, raw: bytes, *args, **kwargs) -> MapData:
        try:
            return super().parse(raw, *args, **kwargs)
        except ValueError as err:
            _LOGGER.debug("viomi map: full parse failed (%s), using partial parse", err)
            _save_raw(raw)
            return self._parse_partial(raw)

    def _parse_partial(self, raw: bytes) -> MapData:
        P = ViomiMapDataParser
        map_data = MapData(0, 1)
        buf = ParsingBuffer("header", raw, 0, len(raw))
        flags = buf.get_uint32("feature_flags")
        map_id = buf.peek_uint32("map_id")
        try:
            if flags & P.FEATURE_ROBOT_STATUS:
                P._parse_section(buf, "robot_status", map_id)
                buf.skip("unknown1", 0x28)
            if flags & P.FEATURE_IMAGE:
                P._parse_section(buf, "image", map_id)
                map_data.image, map_data.rooms, map_data.cleaned_rooms = self._parse_image(buf)
            if flags & P.FEATURE_HISTORY:
                P._parse_section(buf, "history", map_id)
                map_data.path = P._parse_history(buf)
            if flags & P.FEATURE_CHARGE_STATION:
                P._parse_section(buf, "charge_station", map_id)
                map_data.charger = P._parse_position(buf, "pos", with_angle=True)
            if flags & P.FEATURE_RESTRICTED_AREAS:
                P._parse_section(buf, "restricted_areas", map_id)
                map_data.walls, map_data.no_go_areas = P._parse_restricted_areas(buf)
            if flags & P.FEATURE_CLEANING_AREAS:
                P._parse_section(buf, "cleaning_areas", map_id)
                map_data.zones = P._parse_cleaning_areas(buf)
            if flags & P.FEATURE_NAVIGATE:
                P._parse_section(buf, "navigate", map_id)
                buf.skip("unknown1", 4)
                map_data.goto = P._parse_position(buf, "pos")
                buf.get_float32("value")
            if flags & P.FEATURE_REALTIME:
                P._parse_section(buf, "realtime", map_id)
                buf.skip("unknown1", 5)
                map_data.vacuum_position = P._parse_position(buf, "pos", with_angle=True)
        except ValueError as err:
            _LOGGER.debug("viomi map: stopped at %s", err)
        if map_data.vacuum_position is None and map_data.path is not None and map_data.path.path and map_data.path.path[0]:
            pts = map_data.path.path[0]
            last, prev = pts[-1], pts[-2] if len(pts) > 1 else pts[-1]
            a = math.degrees(math.atan2(last.y - prev.y, last.x - prev.x)) if prev is not last else 0.0
            map_data.vacuum_position = Point(last.x, last.y, a)
        if map_data.image is None:
            raise ValueError("viomi map: no image section")
        if not map_data.image.is_empty:
            self._image_generator.draw_map(map_data)
        return map_data


def _save_raw(raw: bytes) -> None:
    try:
        os.makedirs(_RAW_DIR, exist_ok=True)
        files = sorted(f for f in os.listdir(_RAW_DIR) if f.endswith(".bin"))
        if len(files) >= 20:
            return
        with open(os.path.join(_RAW_DIR, f"{int(time.time())}.bin"), "wb") as f:
            f.write(raw)
    except OSError as err:
        _LOGGER.debug("viomi map: could not save raw map: %s", err)


class ViomiCloudVacuum(BaseXiaomiCloudVacuumV2):
    _viomi_map_data_parser: ViomiMapDataParser

    def __init__(self: Self, vacuum_config: VacuumConfig) -> None:
        super().__init__(vacuum_config)
        self._viomi_map_data_parser = TolerantViomiMapDataParser(
            vacuum_config.palette,
            vacuum_config.sizes,
            vacuum_config.drawables,
            vacuum_config.image_config,
            vacuum_config.texts
        )

    @staticmethod
    def vacuum_platform() -> VacuumApi:
        return VacuumApi.VIOMI

    @property
    def map_archive_extension(self: Self) -> str:
        return "zlib"

    @property
    def map_data_parser(self: Self) -> ViomiMapDataParser:
        return self._viomi_map_data_parser
