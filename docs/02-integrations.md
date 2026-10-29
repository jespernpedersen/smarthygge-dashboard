# 2. Connect the devices and add the automations

The dashboard expects the entity ids below (from `dashboard/src/config/home.ts`). After adding each integration,
open **Settings → Devices & services → Entities**, find the device and **rename its entity id** to match.
Anything not renamed yet stays on demo data in the panel and is tagged "demo".

## 2.1 IKEA lights and blinds (TRÅDFRI gateway)
1. Settings → Devices & services. The gateway is usually discovered; otherwise **Add integration → IKEA TRÅDFRI**
   with the gateway's IP and the **security code** from the label underneath.
2. Rename the entities:

| Room | Device | Entity id |
|---|---|---|
| Living room | Ceiling | `light.living_room_ceiling` |
| Living room | Floor lamp | `light.living_room_floor_lamp` |
| Living room | Dining pendant | `light.dining_pendant` |
| Kitchen | Ceiling | `light.kitchen_ceiling` |
| Kitchen | Counter strip | `light.kitchen_counter` |
| Entrance | Ceiling | `light.entrance_ceiling` |
| Bedroom | Ceiling | `light.bedroom_ceiling` |
| Bedroom | Left bedside lamp (WiZ) | `light.bedside_lamp_left` |
| Bedroom | Right bedside lamp | `light.bedside_lamp_right` |
| Office | Ceiling / desk lamp | `light.office_ceiling`, `light.office_desk_lamp` |
| Bathroom | Mirror light | `light.bathroom_mirror` |
| Landing | Ceiling | `light.landing_ceiling` |
| Blinds | Living room, kitchen (only downstairs has smart blinds) | `cover.living_room_blind`, `cover.kitchen_blind` |

The light list is a first guess. If a room has different lights, edit `LIGHTS` in `home.ts`: each light's `pos`
is its spot on the floorplan in metres from the top-left inside corner.

IKEA stopped updating the TRÅDFRI gateway in 2024. When moving to the Pi, plan to replace it with a network Zigbee
coordinator. If the new entities get the same ids, nothing else changes.

## 2.2 Robot vacuum and dishwasher (Xiaomi Home)
Xiaomi's official integration covers both appliances.
1. HACS → search **Xiaomi Home** (github.com/XiaoMi/ha_xiaomi_home) → Download → restart HA.
2. Add integration **Xiaomi Home**, sign in with the Xiaomi account used in the Mi Home app, choose the server
   region the app uses (Europe), and select the vacuum and dishwasher.
3. Rename:

| Device | Entity | Id the panel expects |
|---|---|---|
| Vacuum | the vacuum entity | `vacuum.robot_vacuum` |
| Vacuum | battery level | `sensor.robot_vacuum_battery` |
| Dishwasher | status / mode sensor | `sensor.dishwasher_status` |
| Dishwasher | remaining time | `sensor.dishwasher_remaining_time` |
| Dishwasher | start action button | `button.dishwasher_start` |

Which entities exist depends on the model. Check that the dishwasher exposes a start button and whether the machine
needs **remote start** switched on each time it's loaded. If it can't be started remotely, the "cheapest time"
automation can send a notification instead; ask and it can be changed.

### The vacuum on the floorplan
The panel moves the vacuum marker to the robot's real position and draws the path it has cleaned, using
**Xiaomi Cloud Map Extractor** v3 (HACS → custom repository `PiotrMachowski/Home-Assistant-custom-components-Xiaomi-Cloud-Map-Extractor`).
1. Add the integration and pick **QR code/login link**: approve the login in the Xiaomi Home app. That avoids the captcha
   that blocks password logins. Keep the default map type.
2. Under the integration's entities, enable **Vacuum position** and **Vacuum path** (off by default).
3. The robot's map is turned and offset relative to the floorplan. `VACUUM_MAP` in `dashboard/src/config/home.ts`
   holds the conversion; open the panel with `?vacmap` to see the robot's map drawn over the ground floor while adjusting it.
4. **Patch for this model.** The Mi Robot Vacuum-Mop P uploads maps while cleaning that the parser can't fully read,
   so the position froze during runs. Copy `homeassistant/patches/xiaomi_cloud_map_extractor/vacuum_viomi.py` over
   `/config/custom_components/xiaomi_cloud_map_extractor/connector/vacuums/vacuum_viomi.py` and restart. Redo this after
   updating the integration.
5. Xiaomi Home doesn't always report when this vacuum starts cleaning, so the panel also counts it as cleaning whenever
   its live position is away from the dock.

The status sensor's text varies by model. If "finished" is called something else, adjust the
`hp_dishwasher_finished` trigger in the package and the `/finish|done|complete/` pattern in `ui/app.ts`.

## 2.3 Electricity prices (Energi Data Service)
1. HACS → **Energi Data Service** (github.com/MTrab/energidataservice) → Download → restart.
2. Add integration: pick your price area, VAT on, and tariffs on with your grid company (check them against the
   meter's own tariffs in Eloverblik). Use the cost template for your electricity supplier's markup per kWh before VAT,
   e.g. `{{ 0.30 }}` (supplier price minus that moment's spot price).
3. Keep the entity as `sensor.energi_data_service`. The panel and the dishwasher automation use its
   `raw_today` / `raw_tomorrow` attributes. Tomorrow's prices arrive around 13:00.

## 2.4 Who's home (phones)
1. Install the **Home Assistant Companion** app on each phone and sign in, each person with their own user (see 3.4).
2. Settings → People: link each person to their phone's device tracker. Any ids work; the panel shows every person from Home Assistant.
3. `zone.home` then counts people at home. The vacuum automation uses it.

## 2.5 Electricity use (metrics)
- **Now:** **Eloverblik** (HACS). On eloverblik.dk: menu → **API access** → create token (not *Data sharing*, which
  makes a link for someone else). Paste the token and the 18-digit metering point ID (Metering points page) into the
  integration yourself. It reports the previous day hour by hour; the panel's Energy view shows that day with a cost
  estimated from today's prices for the same hours.
- **Later:** a HAN-port reader on the electricity meter gives live watts (`sensor.house_power`) and same-day kWh.
- Home Assistant keeps hourly statistics indefinitely, so the panel's Energy view gets real history without extra databases.

## 2.6 Install the package (helpers, scenes, automations)
1. Copy `homeassistant/packages/smarthygge.yaml` to `/config/packages/` and
   `homeassistant/custom_templates/smarthygge.jinja` to `/config/custom_templates/` (via the Samba share).
2. In `/config/configuration.yaml` add:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
3. Developer tools → YAML → **Check configuration** → **Restart**.

It adds: `input_boolean.dishwasher_loaded`, `input_boolean.vacuum_auto_clean`, `input_datetime.vacuum_last_clean`,
`counter.dishwasher_runs`, `counter.vacuum_runs`, `sensor.dishwasher_planned_start`, the six scenes, and the automations:

| Automation | What it does |
|---|---|
| Dishwasher – start at the cheapest time | When "loaded" is on, starts in the cheapest 3-hour window that ends before 07:00 |
| Dishwasher – tell us when it's done | Phone notification |
| Vacuum – clean when everyone is out | Once a day, 09–18, 10 minutes after the last person leaves |
| Vacuum – go home when someone arrives | Sends it back to the dock |
| Blinds – close at sunset | Living room and kitchen blinds |
| Night table lamps – off in daylight | Switches them off at sunrise, and straight back off if turned on while the sun is up |
| Night table lamps – follow the evening | Never turns them on. While on after sunset: 2700 K 70 % → from 3 h before bedtime 2200 K 40 % → 1 h before 2200 K 15 % → from 30 min after bedtime deep amber 1 % → 45 min before sunrise 2200 K 25 %. Bedtime is `input_datetime.bedtime` (23:00) |
| Stats – reset weekly counters | Monday 00:00 |

## 2.7 Still to decide
- **TV**: brand and model decide the integration (LG webOS, Samsung, Android/Google TV, Sony…). Rename it to `media_player.living_room_tv`.
- **Room temperature/humidity**: a few Zigbee sensors (e.g. IKEA or Aqara) give per-room temperatures. Until then the panel shows demo values.
