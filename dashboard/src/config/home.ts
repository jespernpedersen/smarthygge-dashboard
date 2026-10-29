/**
 * Smart Hygge — everything the dashboard knows about the house.
 *
 * Geometry is in metres for a fictional demo townhouse (interior 5.80 × 7.50 m, two floors,
 * x → right, z → down on screen). `entity` fields are Home Assistant entity ids:
 * once an integration is set up, rename the entity in HA to match, or change it here.
 * Anything whose entity doesn't exist yet keeps running on demo data.
 */

export type Floor = 'ground' | 'up';
export type Rect = [x0: number, z0: number, x1: number, z1: number];
export type Vec3 = [x: number, y: number, z: number];

export interface RoomDef { floor: Floor; name: string; icon: string; r: Rect; temp?: string }
export interface LightDef {
  id: string; entity: string; room: string; name: string; icon: string;
  /** one point light per position (e.g. two bedside lamps on one entity) */
  pos: Vec3[];
  /** lumen at 100 %, used for the 3D light strength */
  lm: number;
  fx: 'flush' | 'pendant' | 'floor' | 'table' | 'none';
}
export interface BlindDef { id: string; entity: string; room: string; name: string }
export interface SceneDef { id: string; entity: string; name: string; icon: string; demo: Record<string, Record<string, unknown>> }

export const FLOORS: Record<Floor, string> = { ground: 'Ground floor', up: 'Upstairs' };

export const ROOMS: Record<string, RoomDef> = {
  kitchen:  { floor: 'ground', name: 'Kitchen',     icon: 'kitchen',    r: [0, 0, 3.0, 3.1] },
  entrance: { floor: 'ground', name: 'Entrance',    icon: 'door_front', r: [3.0, 0, 5.8, 3.1] },
  living:   { floor: 'ground', name: 'Living room', icon: 'weekend',    r: [0, 3.1, 5.8, 7.5],     temp: 'sensor.living_room_temperature' },
  bath:     { floor: 'up',     name: 'Bathroom',    icon: 'shower',     r: [0, 0, 3.0, 2.6] },
  office:   { floor: 'up',     name: 'Office',      icon: 'desk',       r: [0, 2.6, 3.0, 4.4] },
  landing:  { floor: 'up',     name: 'Landing',     icon: 'stairs',     r: [3.0, 0, 5.8, 4.4] },
  bedroom:  { floor: 'up',     name: 'Bedroom',     icon: 'bed',        r: [0, 4.4, 5.8, 7.5],     temp: 'sensor.bedroom_temperature' },
};

export const LIGHTS: LightDef[] = [
  { id: 'living_ceiling',   entity: 'light.living_room_ceiling', room: 'living',   name: 'Ceiling',        icon: 'lightbulb',     pos: [[3.4, 2.4, 5.4]],                    lm: 1200, fx: 'flush' },
  { id: 'living_floor',     entity: 'light.living_room_floor_lamp', room: 'living', name: 'Floor lamp',    icon: 'floor_lamp',    pos: [[3.1, 1.45, 6.75]],                  lm: 600,  fx: 'floor' },
  { id: 'dining_pendant',   entity: 'light.dining_pendant',      room: 'living',   name: 'Dining pendant', icon: 'light',         pos: [[1.2, 1.5, 4.5]],                    lm: 700,  fx: 'pendant' },
  { id: 'kitchen_ceiling',  entity: 'light.kitchen_ceiling',     room: 'kitchen',  name: 'Ceiling',        icon: 'lightbulb',     pos: [[1.6, 2.4, 1.5]],                    lm: 1100, fx: 'flush' },
  { id: 'kitchen_strip',    entity: 'light.kitchen_counter',     room: 'kitchen',  name: 'Counter strip',  icon: 'wb_iridescent', pos: [[1.6, 1.25, 0.4]],                   lm: 450,  fx: 'none' },
  { id: 'entrance_ceiling', entity: 'light.entrance_ceiling',    room: 'entrance', name: 'Ceiling',        icon: 'lightbulb',     pos: [[4.0, 2.4, 1.6]],                    lm: 800,  fx: 'flush' },
  { id: 'bed_ceiling',      entity: 'light.bedroom_ceiling',     room: 'bedroom',  name: 'Ceiling',        icon: 'lightbulb',     pos: [[2.9, 2.4, 6.1]],                    lm: 1000, fx: 'flush' },
  { id: 'bed_left',         entity: 'light.bedside_lamp_left',   room: 'bedroom',  name: 'Bedside lamp, left',  icon: 'table_lamp', pos: [[1.67, 0.72, 4.68]],            lm: 350,  fx: 'table' },
  { id: 'bed_right',        entity: 'light.bedside_lamp_right',  room: 'bedroom',  name: 'Bedside lamp, right', icon: 'table_lamp', pos: [[4.12, 0.72, 4.68]],            lm: 350,  fx: 'table' },
  { id: 'office_ceiling',   entity: 'light.office_ceiling',      room: 'office',   name: 'Ceiling',        icon: 'lightbulb',     pos: [[1.6, 2.4, 3.5]],                    lm: 1000, fx: 'flush' },
  { id: 'office_desk',      entity: 'light.office_desk_lamp',    room: 'office',   name: 'Desk lamp',      icon: 'table_lamp',    pos: [[0.35, 1.02, 2.95]],                 lm: 450,  fx: 'table' },
  { id: 'bath_mirror',      entity: 'light.bathroom_mirror',     room: 'bath',     name: 'Mirror light',   icon: 'wb_iridescent', pos: [[1.85, 1.85, 0.18]],                 lm: 700,  fx: 'none' },
  { id: 'landing_ceiling',  entity: 'light.landing_ceiling',     room: 'landing',  name: 'Ceiling',        icon: 'lightbulb',     pos: [[4.0, 2.4, 3.3]],                    lm: 700,  fx: 'flush' },
];

export const BLINDS: BlindDef[] = [
  { id: 'living',  entity: 'cover.living_room_blind', room: 'living',  name: 'Living room blind' },
  { id: 'kitchen', entity: 'cover.kitchen_blind',     room: 'kitchen', name: 'Kitchen blind' },
];

/** Google TV: the Android TV Remote entity (power, volume steps, opening apps by package) plus Google Cast (what's playing) */
export const TV = {
  entity: 'media_player.living_room_tv',
  cast: 'media_player.living_room_tv_cast',
  name: 'Living room TV',
  apps: [
    { name: 'Netflix', id: 'com.netflix.ninja' },
    { name: 'YouTube', id: 'com.google.android.youtube.tv' },
    { name: 'DR TV', id: 'dk.dr.tvapp' },
    { name: 'TV 2 Play', id: 'dk.tv2.tv2playtv' },
  ],
};

/** demo people only: when connected, the panel shows every person from Home Assistant instead */
export const PEOPLE = [
  { entity: 'person.alex', name: 'Alex', initial: 'A' },
  { entity: 'person.sam',  name: 'Sam',  initial: 'S' },
];

/** Xiaomi Home integration entities. Check the real ids under Settings → Devices after pairing. */
export const VACUUM = {
  entity: 'vacuum.robot_vacuum',
  battery: 'sensor.robot_vacuum_battery',
  name: 'Robot vacuum',
  floor: 'ground' as Floor,
  dock: [0.3, 6.8] as [number, number],
};
/** Xiaomi Cloud Map Extractor: the robot's live position and path, in metres on its own map with the dock near (0, 0).
 *  Floorplan metres: x = x0 + s·(rx·cos θ − ry·sin θ), z = z0 − s·(rx·sin θ + ry·cos θ) with θ = rot (degrees).
 *  Check the fit with ?vacmap, which draws the robot's map on the ground floor. */
export const VACUUM_MAP = {
  position: 'sensor.mi_robot_vacuum_mop_p_vacuum_position',
  charger: 'sensor.mi_robot_vacuum_mop_p_charger_position',
  path: 'sensor.mi_robot_vacuum_mop_p_vacuum_path',
  image: 'image.mi_robot_vacuum_mop_p_live_map',
  rot: 0, s: 1, x0: 0.3, z0: 6.8, // fit these to your own home with ?vacmap
};
/** a dishwasher via Home Connect */
export const DISHWASHER = {
  /** inactive | ready | delayedstart | run | pause | actionrequired | finished | error | aborting */
  status: 'sensor.dishwasher_operation_state',
  finishTime: 'sensor.dishwasher_programme_finish_time',
  progress: 'sensor.dishwasher_programme_progress',
  door: 'sensor.dishwasher_door',
  remoteStart: 'binary_sensor.dishwasher_remote_start',
  name: 'Dishwasher',
  pos: [2.47, 0.75] as [number, number], // under the counter, next to the sink
  /** helpers and sensors created by homeassistant/packages/smarthygge.yaml */
  loaded: 'input_boolean.dishwasher_loaded',
  plannedStart: 'sensor.dishwasher_planned_start',
  startsAt: 'input_datetime.dishwasher_starts_at',
  startNow: 'script.dishwasher_start_now',
  /** Eco 50 takes 3 h 35 min, so the cheapest window is 4 hours long (same as the automation) */
  runHours: 4,
};
export const VACUUM_HELPERS = {
  autoClean: 'input_boolean.vacuum_auto_clean',
  lastClean: 'input_datetime.vacuum_last_clean',
  logAutomation: 'automation.vacuum_log_a_finished_clean',
};

export const CLIMATE = {
  indoorTemp: 'sensor.living_room_temperature',
  humidity: 'sensor.living_room_humidity',
  weather: 'weather.forecast_home',
};

export const ENERGY = {
  /** live power draw in W (later from a HAN-port reader) */
  power: 'sensor.house_power',
  /** cumulative kWh meter used for hourly statistics */
  energy: 'sensor.house_energy',
  /** Energi Data Service spot price incl. tariffs, kr/kWh, with raw_today / raw_tomorrow attributes */
  price: 'sensor.energi_data_service',
  /** Eloverblik (the national meter data hub): the latest metered day, usually yesterday, as a total and 24 hourly sensors */
  meteredTotal: 'sensor.eloverblik_energy_total',
  meteredHour: (h: number) => `sensor.eloverblik_energy_${h}_${h + 1}`,
};

export const SCENES: SceneDef[] = [
  { id: 'cooking', entity: 'scene.cooking', name: 'Cooking', icon: 'skillet', demo: {
    'light.kitchen_ceiling': { state: 'on', b: 100, k: 3500 }, 'light.kitchen_counter': { state: 'on', b: 100, k: 3500 }, 'light.dining_pendant': { state: 'on', b: 60, k: 2700 } } },
  { id: 'dinner', entity: 'scene.dinner', name: 'Dinner', icon: 'dinner_dining', demo: {
    'light.kitchen_ceiling': { state: 'on', b: 18, k: 2400 }, 'light.kitchen_counter': { state: 'on', b: 35, k: 2400 }, 'light.dining_pendant': { state: 'on', b: 80, k: 2200 },
    'light.living_room_floor_lamp': { state: 'on', b: 45, k: 2200 }, 'light.living_room_ceiling': { state: 'off' } } },
  { id: 'movie', entity: 'scene.movie', name: 'Movie', icon: 'movie', demo: {
    'light.living_room_ceiling': { state: 'off' }, 'light.living_room_floor_lamp': { state: 'on', b: 18, k: 2200 }, 'light.dining_pendant': { state: 'off' },
    'light.kitchen_ceiling': { state: 'off' }, 'light.kitchen_counter': { state: 'on', b: 15, k: 2200 }, 'cover.living_room_blind': { p: 0 }, 'media_player.living_room_tv': { state: 'on' } } },
  { id: 'morning', entity: 'scene.morning', name: 'Morning', icon: 'wb_twilight', demo: {
    'light.kitchen_ceiling': { state: 'on', b: 70, k: 3800 }, 'light.kitchen_counter': { state: 'on', b: 80, k: 3800 }, 'light.landing_ceiling': { state: 'on', b: 50, k: 3000 },
    'cover.living_room_blind': { p: 100 }, 'cover.kitchen_blind': { p: 100 } } },
  { id: 'good_night', entity: 'scene.good_night', name: 'Good night', icon: 'bedtime', demo: {
    '*light': { state: 'off' }, 'light.landing_ceiling': { state: 'on', b: 8, k: 2200 },
    'cover.living_room_blind': { p: 0 }, 'cover.kitchen_blind': { p: 0 }, 'media_player.living_room_tv': { state: 'off' } } },
  { id: 'all_off', entity: 'scene.all_off', name: 'All off', icon: 'power_settings_new', demo: {
    '*light': { state: 'off' }, 'media_player.living_room_tv': { state: 'off' } } },
];

/** Personal themes, by Home Assistant user name (lower case). Everyone else, and the kiosk, gets the default.
 *  Preview any theme with ?theme=kawaii (or ?theme=default to switch back). */
/** compass direction the top of the floorplan faces, in degrees (0 = north, 90 = east, 180 = south, 270 = west); aims the sunlight */
export const PLAN_NORTH = 0;

export const USER_THEMES: Record<string, string> = {
  sam: 'kawaii',
};

/** Panel language per Home Assistant user (lower case); everyone else gets English. Preview with ?lang=cs / ?lang=en. */
export const USER_LANGS: Record<string, string> = {
  sam: 'cs',
};
