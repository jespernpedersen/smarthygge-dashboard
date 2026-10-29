declare global { interface Window { __t: (s: string, v?: Record<string, string | number>) => string } }
/**
 * The wall-panel UI: sidebar, floorplan overlays (markers, chips, today card), the middle
 * control panel and the light popover. Everything reads from `store` and writes through
 * `store.call(...)`, so it behaves the same on demo data and on the real house.
 */
import { store } from '../data/store';
import { HouseScene } from '../scene/house';
import { FLOORS, ROOMS, LIGHTS, BLINDS, TV, PLAN_NORTH, VACUUM, VACUUM_MAP, VACUUM_HELPERS, DISHWASHER, CLIMATE, ENERGY, SCENES, USER_THEMES, USER_LANGS, type Floor, type LightDef, type BlindDef } from '../config/home';
import { fmtTime, fmtKr, sunPosition } from '../data/logic';
import { priceChart, usageChart, ring, esc } from './charts';
import { DEMO_ROOM_TEMPS } from '../data/demo';
import { t, setLang, getLang, locale, translateStatic } from './i18n';
import type { HassEntity, HourValue, PricePoint } from '../data/types';

type Mode = 'rooms' | 'lights' | 'scenes' | 'appliances' | 'energy' | 'blinds' | 'media' | 'devices' | 'device';
const MENU: [Mode, string, string][] = [
  ['rooms', 'Control rooms', 'space_dashboard'], ['lights', 'Control lights', 'lightbulb'], ['scenes', 'Scenes', 'auto_awesome'],
  ['appliances', 'Appliances', 'cleaning_services'], ['energy', 'Energy', 'bolt'], ['blinds', 'Blinds', 'roller_shades'],
  ['media', 'Media', 'play_circle'], ['devices', 'All devices', 'devices'],
];
/** counters created by homeassistant/packages/smarthygge.yaml */
const STATS = { dishwasherRuns: 'counter.dishwasher_runs', vacuumRuns: 'counter.vacuum_runs' };
const DISHWASHER_KWH = 0.95; // eco programme, per run

const $ = (id: string) => document.getElementById(id)!;
let house: HouseScene;
let mode: Mode = 'lights', floor: Floor = 'ground', selRoom: string | null = null, popId: string | null = null;
let sunMode: 'auto' | 'day' | 'night' = 'auto', dragging = false;
const lastHtml: Record<string, string> = {};
const setHtml = (el: Element, key: string, html: string) => { if (lastHtml[key] !== html) { lastHtml[key] = html; el.innerHTML = html; } };

/* ---------------- derived state ---------------- */
const light = (L: LightDef) => {
  const e = store.get(L.entity);
  return { on: e?.state === 'on', offline: e?.state === 'unavailable', b: Math.max(1, Math.round(((e?.attributes.brightness ?? 255) / 255) * 100)), k: e?.attributes.color_temp_kelvin ?? 2700, live: store.isLive(L.entity) };
};
const blindP = (b: BlindDef): number => { const e = store.get(b.entity); return e?.attributes.current_position ?? (e?.state === 'closed' ? 0 : 100); };
const tv = () => {
  const e = store.get(TV.entity), c = store.get(TV.cast);
  // the remote reports the foreground app's package (com.netflix.ninja); show its name, and Cast's title when something plays
  const pkg = e?.attributes.app_id ?? e?.attributes.app_name ?? e?.attributes.source ?? '';
  const app = TV.apps.find((a) => a.id === pkg)?.name ?? (/launcher/.test(pkg) ? window.__t('Home screen') : c?.attributes.app_name ?? pkg);
  const playing = e?.state === 'playing' || c?.state === 'playing';
  return { on: !!e && !['off', 'standby', 'unavailable', 'unknown'].includes(e.state), playing, vol: Math.round((e?.attributes.volume_level ?? 0) * 100), app, title: c?.attributes.media_title as string | undefined };
};
const prices = (): PricePoint[] => store.get(ENERGY.price)?.attributes.raw_today ?? [];
const pricesAll = (): PricePoint[] => [...prices(), ...(store.get(ENERGY.price)?.attributes.raw_tomorrow ?? [])];
const priceLevel = (p: number) => {
  const v = prices().map((x) => x.price).sort((a, b) => a - b); if (!v.length) return 'mid';
  return p <= v[Math.floor(v.length / 3)] ? 'cheap' : p >= v[Math.floor((v.length * 2) / 3)] ? 'dear' : 'mid';
};
const dishwasher = () => {
  const status = store.get(DISHWASHER.status)?.state ?? 'unknown';
  const running = status === 'run' || status === 'pause', delayed = status === 'delayedstart';
  const fin = Date.parse(store.get(DISHWASHER.finishTime)?.state ?? '');
  const remaining = running && Number.isFinite(fin) ? Math.max(0, Math.round((fin - Date.now()) / 60e3)) : 0;
  const ps = store.get(DISHWASHER.plannedStart), sa = store.get(DISHWASHER.startsAt);
  // before it starts: the planned window; once it's counting down on the machine: the time the automation set
  const planned = delayed && sa?.attributes.timestamp ? new Date(sa.attributes.timestamp * 1000)
    : ps && !['unknown', 'unavailable'].includes(ps.state) ? new Date(ps.state) : null;
  return {
    status, remaining, running, delayed, finished: status === 'finished', attention: status === 'actionrequired' || status === 'error',
    loaded: store.get(DISHWASHER.loaded)?.state === 'on', planned, plannedPrice: ps?.attributes.price as number | null,
    doorOpen: store.get(DISHWASHER.door)?.state === 'open', remoteOk: store.get(DISHWASHER.remoteStart)?.state === 'on',
    frac: running ? store.num(DISHWASHER.progress, 0) / 100 : 0,
  };
};
/** what to do next, when "Run at cheapest time" is on but the dishwasher can't be started yet */
const dwBlocker = (d: ReturnType<typeof dishwasher>) => !d.loaded || d.running || d.delayed ? '' : d.doorOpen ? t('Close the door to start') : !d.remoteOk ? t('Press Remote Start on the dishwasher') : '';
/* Xiaomi Home never reports this old model's state changes, so with the live map connected the panel works the state
   out from the robot's position (updated every ~10 s) and the last button pressed. */
let vacCmd: { cmd: string; at: number } | null = null;
let vacAwayAt = 0; // last time it was seen out in the room
function vacState(): string {
  const ha = store.get(VACUUM.entity)?.state ?? 'unknown', pos = store.get(VACUUM_MAP.position);
  if (!store.isLive(VACUUM_MAP.position) || !pos || ha === 'error') return ha;
  const now = Date.now(), moving = now - Date.parse(pos.last_changed ?? '') < 35e3, away = vacAway();
  if (vacCmd?.cmd === 'start') { // show the press right away; position updates lag up to ~10 s
    const since = now - vacCmd.at;
    if (!away && since < 120e3) return 'starting';
    if (away && since < 30e3) return 'cleaning';
    vacCmd = null;
  }
  const cmd = vacCmd?.cmd;
  if (away) vacAwayAt = now;
  // moving near the dock: arriving if it was just out in the room, otherwise setting off (started from the app)
  if (!away) { vacCmd = null; return !moving ? 'docked' : now - vacAwayAt < 90e3 ? 'returning' : 'cleaning'; }
  if (cmd === 'return_to_base') return 'returning';
  if (cmd === 'pause') {
    if (Date.parse(pos.last_changed ?? '') < vacCmd!.at + 15e3) return 'paused';
    vacCmd = null; // moving again well after Pause: resumed from the app
  }
  return moving ? 'cleaning' : 'paused';
}
const vacuum = () => {
  const e = store.get(VACUUM.entity), state = vacState();
  // the helper only means something once the "log a finished clean" automation has run at least once
  const logged = store.status.mode !== 'live' || !!store.get(VACUUM_HELPERS.logAutomation)?.attributes.last_triggered;
  const last = logged ? store.get(VACUUM_HELPERS.lastClean) : undefined;
  const lastTs = last?.attributes.timestamp ? last.attributes.timestamp * 1000 : Date.parse(last?.state ?? '');
  const progress = e?.attributes.progress as number | undefined; // only some models report it
  return { state, battery: store.num(VACUUM.battery, NaN), progress: progress ?? 0, hasProgress: progress != null, cleaning: state === 'cleaning', docked: state === 'docked' || state === 'starting', auto: store.get(VACUUM_HELPERS.autoClean)?.state === 'on', last: Number.isFinite(lastTs) ? new Date(lastTs) : null };
};
const vacLabel = (v: ReturnType<typeof vacuum>) => v.cleaning ? (v.hasProgress ? t('Cleaning · {p}%', { p: Math.round(v.progress * 100) }) : t('Cleaning')) : v.state === 'starting' ? t('Starting…')
  : v.state === 'returning' ? t('Returning to dock') : v.state === 'docked' ? t('Docked') : esc(t(v.state));
/** a room's temperature: its real sensor, made-up values only in demo mode (NaN when connected without a sensor) */
const roomTemp = (id: string) => { const t = ROOMS[id].temp; const v = t && store.isLive(t) ? store.num(t) : NaN; return Number.isFinite(v) || store.status.mode === 'live' ? v : DEMO_ROOM_TEMPS[id]; };
const roomTempTxt = (id: string) => { const v = roomTemp(id); return Number.isFinite(v) ? v.toFixed(1) + '°' : ''; };
const roomStats = (id: string) => { const ls = LIGHTS.filter((l) => l.room === id); return { on: ls.filter((l) => light(l).on).length, n: ls.length }; };
/* The sun: its real position for the home's location lights the floorplan. The sun chip plays today
   from 05:00 to 05:00 in 30 seconds. */
const SUN_DEMO_MS = 30000;
let sunDemo: { start: number; from: number } | null = null;
const sunNow = (d: Date) => sunPosition(d, store.location.latitude, store.location.longitude);
const sunDemoTime = () => new Date(sunDemo!.from + 86400000 * (performance.now() - sunDemo!.start) / SUN_DEMO_MS);
const fmtDemoTime = (d: Date) => fmtTime(new Date(Math.floor(d.getTime() / 600000) * 600000)); // whole 10 minutes, so the chip doesn't flicker
function startSunDemo() {
  const from = new Date(), md = /^(\d\d)-(\d\d)$/.exec(new URLSearchParams(location.search).get('date') ?? ''); // ?date=06-21 plays another day of the year
  if (md) from.setMonth(+md[1] - 1, +md[2]);
  from.setHours(5, 0, 0, 0);
  sunDemo = { start: performance.now(), from: from.getTime() };
  const step = () => {
    if (!sunDemo) return;
    if (performance.now() - sunDemo.start >= SUN_DEMO_MS) { stopSunDemo(); return; }
    house.setSun(sunNow(sunDemoTime()), PLAN_NORTH, cloudiness()); renderChips();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function stopSunDemo() { sunDemo = null; renderAll(); }
/** 0 (clear) – 1 (overcast) from the weather forecast's current condition */
const CLOUD: Record<string, number> = { sunny: 0, 'clear-night': 0, partlycloudy: .4, windy: .2, 'windy-variant': .5, cloudy: .85, fog: .9, rainy: .85, pouring: 1, snowy: .8, 'snowy-rainy': .9, hail: .9, lightning: .9, 'lightning-rainy': 1, exceptional: .5 };
const cloudiness = () => CLOUD[store.get(CLIMATE.weather)?.state ?? ''] ?? 0;
const isDay = () => {
  if (sunDemo) return sunNow(sunDemoTime()).el > -0.83;
  if (sunMode !== 'auto') return sunMode === 'day';
  const sun = store.get('sun.sun'); if (sun) return sun.state === 'above_horizon';
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes(); return m >= 7 * 60 + 45 && m < 18 * 60 + 25;
};
const ago = (d: Date) => { const h = (Date.now() - d.getTime()) / 3600e3; return h < 1 ? t('just now') : h < 24 ? t('{n} h ago', { n: Math.round(h) }) : t('{n} d ago', { n: Math.round(h / 24) }); };
const dur = (min: number) => min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`;
const isDemo = (entity: string) => store.status.mode === 'live' && !store.isLive(entity);
const demoTag = (entity: string) => store.status.mode === 'live' && !store.isLive(entity) ? '<span class="demo-tag">demo</span>' : '';

/* ---------------- 3D sync ---------------- */
function syncHouse() {
  for (const L of LIGHTS) { const s = light(L); house.setLight(L.id, s.on, s.b, s.k); }
  for (const b of BLINDS) house.setBlind(b.id, blindP(b));
  house.setTv(tv().on);
  house.setDay(isDay());
  if (!sunDemo) house.setSun(sunMode === 'auto' ? sunNow(new Date()) : null, PLAN_NORTH, cloudiness()); // follow the real sun unless forced with ?sun=
}

/* ---------------- sidebar ---------------- */
function renderMenu() { setHtml($('menu'), 'menu', MENU.map(([id, l, ic]) => `<button class="mi" data-m="${id}" aria-current="${mode === id}"><span>${t(l)}</span><span class="ms">${ic}</span></button>`).join('')); }
function renderSide() {
  const t = tv(), tr = (x: string) => window.__t(x); $('np').hidden = !t.on; $('npApp').textContent = t.app || tr('On');
  // everyone who is a person in Home Assistant (with their profile photo), demo people until connected
  const people = store.domain('person').sort((a, b) => (a.attributes.friendly_name ?? '').localeCompare(b.attributes.friendly_name ?? ''));
  setHtml($('people'), 'people', people.map((p) => {
    const name = p.attributes.friendly_name ?? p.entity_id.split('.')[1], home = p.state === 'home', demo = isDemo(p.entity_id);
    const pic = p.attributes.entity_picture ? `<img src="${esc(store.url(p.attributes.entity_picture))}" alt="">` : esc(name.charAt(0).toUpperCase());
    const noPhone = !demo && p.state === 'unknown'; // a Home Assistant person with no phone linked yet
    const where = demo ? tr('not connected yet') : noPhone ? tr('no phone connected yet') : home ? tr('home') : p.state === 'not_home' ? tr('away') : p.state;
    return `<div class="av ${home ? 'home' : 'away'} ${demo || noPhone ? 'demo' : ''}" title="${esc(name)} · ${esc(where)}">${pic}</div>`;
  }).join(''));
  const w = store.get(CLIMATE.weather), out = w?.attributes.temperature, inside = store.num(CLIMATE.indoorTemp);
  const cond = w?.state ? tr(w.state) : '';
  setHtml($('wx'), 'wx', `<div class="r"><span><b>${out != null ? (+out).toFixed(1) : '–'} °C</b> &nbsp;${esc(cond || tr('Outside'))}</span><span class="ms">${/rain/.test(w?.state ?? '') ? 'rainy' : /sun|clear/.test(w?.state ?? '') ? 'sunny' : 'cloud'}</span></div>
    <div class="r"><span><b>${Number.isFinite(inside) ? inside.toFixed(1) : '–'} °C</b> &nbsp;${tr('Inside')}${demoTag(CLIMATE.indoorTemp)}</span><span class="ms">thermostat</span></div>`);
  const s = store.status, c = $('conn');
  c.className = 'conn' + (s.mode === 'live' ? ' live' : s.mode === 'error' ? ' err' : '');
  c.querySelector('span')!.textContent = tr(s.mode === 'live' ? 'Home Assistant · live' : s.mode === 'connecting' ? 'Connecting…' : s.mode === 'error' ? 'Home Assistant unreachable · demo' : 'Demo data');
  c.title = s.mode === 'error' ? s.message : s.mode === 'demo' ? 'Open with ?ha=http://homeassistant.local:8123 to connect' : (s as any).url ?? '';
}

/* ---------------- floorplan overlays ---------------- */
const VAC_PATH: [number, number][] = (() => { const p: [number, number][] = []; let flip = false; for (let z = 3.7; z <= 6.2; z += .62) { const row: [number, number][] = [[2.4, z], [5.3, z]]; p.push(...(flip ? row.reverse() : row)); flip = !flip; } return p; })();
function vacPos(t: number): [number, number] {
  const segs = VAC_PATH.slice(1).map((b, i) => { const a = VAC_PATH[i]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  let d = t * segs.reduce((s, x) => s + x.len, 0);
  for (const s of segs) { if (d <= s.len) { const f = d / s.len; return [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f]; } d -= s.len; }
  return VAC_PATH[VAC_PATH.length - 1];
}
/** robot map metres → floorplan [x, z] (see VACUUM_MAP in config/home.ts) */
function vacToPlan(rx: number, ry: number): [number, number] {
  const { rot, s, x0, z0 } = VACUUM_MAP, a = rot * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
  return [x0 + s * (rx * c - ry * n), z0 - s * (rx * n + ry * c)];
}
/** live position from the map extractor, or null when it isn't connected */
function vacLive(): [number, number] | null {
  const p = store.get(VACUUM_MAP.position), x = Number(p?.attributes.x), y = Number(p?.attributes.y);
  return store.isLive(VACUUM_MAP.position) && Number.isFinite(x) && Number.isFinite(y) && (x || y) ? vacToPlan(x, y) : null; // exactly 0,0 is a failed map read
}
/** the robot's heading on screen in degrees (0 = pointing right), from the map extractor's angle */
function vacHeading(): number {
  const a = Number(store.get(VACUUM_MAP.position)?.attributes.a);
  if (!Number.isFinite(a)) return -90;
  const r = (a * Math.PI) / 180, { rot, s } = VACUUM_MAP, th = (rot * Math.PI) / 180;
  // a unit step along the robot's heading, carried into floorplan metres (x right, z down the screen)
  const dx = s * (Math.cos(r) * Math.cos(th) - Math.sin(r) * Math.sin(th)), dz = -s * (Math.cos(r) * Math.sin(th) + Math.sin(r) * Math.cos(th));
  return (Math.atan2(dz, dx) * 180) / Math.PI;
}
/** true when the map extractor puts the robot more than 40 cm from its dock */
function vacAway(): boolean {
  const p = store.get(VACUUM_MAP.position)?.attributes, c = store.get(VACUUM_MAP.charger)?.attributes;
  if (!store.isLive(VACUUM_MAP.position) || !store.isLive(VACUUM_MAP.charger)) return false;
  const d = Math.hypot(Number(p?.x) - Number(c?.x), Number(p?.y) - Number(c?.y));
  return Number.isFinite(d) && d > .4;
}
/** the path cleaned so far this run, as polylines in floorplan metres */
function vacTrail(): [number, number][][] {
  const raw = store.get(VACUUM_MAP.path)?.attributes.path;
  if (!Array.isArray(raw)) return [];
  const pt = (q: any): [number, number] | null => { const x = Number(Array.isArray(q) ? q[0] : q?.x), y = Number(Array.isArray(q) ? q[1] : q?.y); return Number.isFinite(x) && Number.isFinite(y) ? vacToPlan(x, y) : null; };
  const isPoint = (q: any) => q?.x != null || (Array.isArray(q) && typeof q[0] === 'number');
  const lines: any[][] = raw.some(isPoint) ? [raw] : raw.filter(Array.isArray);
  return lines.map((l) => l.map(pt).filter((q): q is [number, number] => !!q)).filter((l) => l.length > 1);
}
/** ?vacmap: lays the robot's own map over the ground floor to check VACUUM_MAP's fit */
async function showVacMap() {
  for (let i = 0; i < 40 && !store.isLive(VACUUM_MAP.image); i++) await new Promise((r) => setTimeout(r, 250));
  const e = store.get(VACUUM_MAP.image), cal = e?.attributes.calibration_points as { vacuum: { x: number; y: number }; map: { x: number; y: number } }[] | undefined;
  if (!e?.attributes.entity_picture || !cal || cal.length < 3) return;
  const img = new Image(); img.src = store.url(e.attributes.entity_picture); await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), bg = d.data.slice(0, 3);
  for (let i = 0; i < d.data.length; i += 4) if (Math.abs(d.data[i] - bg[0]) + Math.abs(d.data[i + 1] - bg[1]) + Math.abs(d.data[i + 2] - bg[2]) < 12) d.data[i + 3] = 0;
  g.putImageData(d, 0, 0);
  // image pixel → robot metres, from the three calibration points
  const [a, b, k] = cal, ux = (b.map.x - a.map.x) / (b.vacuum.x - a.vacuum.x), vy = (k.map.y - a.map.y) / (k.vacuum.y - a.vacuum.y);
  const toRobot = (px: number, py: number): [number, number] => [a.vacuum.x + (px - a.map.x) / ux, a.vacuum.y + (py - a.map.y) / vy];
  house.setOverlay(c, [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]].map(([px, py]) => vacToPlan(...toRobot(px, py))));
}
const shows = (f: Floor) => house.visibleFloors().includes(f);
const onFloor = (room: string) => shows(ROOMS[room].floor);

function renderMarks() {
  let h = '';
  const P = (x: number, z: number, f: Floor = 'ground') => house.project(x, 2.5, z, f);
  if (house.dual) for (const f of ['ground', 'up'] as Floor[]) { const [x, y] = house.project(2.9, 0, 8.25, f); h += `<div class="flabel" style="left:${x}px;top:${y}px">${t(FLOORS[f])}</div>`; }
  if (mode === 'lights' || mode === 'scenes' || mode === 'devices') {
    for (const L of LIGHTS) {
      if (!onFloor(L.room)) continue;
      const s = light(L), x = L.pos.reduce((a, q) => a + q[0], 0) / L.pos.length, z = L.pos.reduce((a, q) => a + q[2], 0) / L.pos.length;
      // drawn at about table height, so a pendant's button sits over what it lights instead of drifting in perspective
      const [px, py] = house.project(x, Math.min(.8, L.pos[0][1]), z, ROOMS[L.room].floor);
      h += `<button class="mk ${s.on ? 'on' : ''} ${isDemo(L.entity) ? 'demo' : ''} ${s.offline ? 'offline' : ''}" data-l="${L.id}" style="left:${px}px;top:${py}px" title="${s.offline ? t('Offline · no power?') : ''}" aria-label="${t('{room} {name}, {state}. Long-press for brightness', { room: t(ROOMS[L.room].name), name: t(L.name), state: s.offline ? t('Offline · no power?') : t(s.on ? 'on' : 'off') })}"><span class="ms">${L.icon}</span></button>`;
    }
  }
  if ((mode === 'lights' || mode === 'media' || mode === 'device') && shows('ground')) { const [x, y] = P(4.5, 4.0); h += `<button class="mk tv ${tv().on ? 'on' : ''} ${isDemo(TV.entity) ? 'demo' : ''}" data-tv="1" style="left:${x}px;top:${y}px" aria-label="${t('Living room TV')}, ${t(tv().on ? 'on' : 'off')}"><span class="ms">tv</span></button>`; }
  if ((mode === 'lights' || mode === 'appliances' || mode === 'device') && shows('ground')) {
    const v = vacuum(), [vx, vz] = vacLive() ?? (v.cleaning || v.state === 'returning' ? (v.cleaning ? vacPos(v.progress) : [VACUUM.dock[0] + .3, VACUUM.dock[1]]) : VACUUM.dock);
    const [x, y] = house.project(vx, .1, vz);
    const moving = v.cleaning || v.state === 'returning' || v.state === 'starting';
    h += `<button class="mk vacbot ${moving ? 'run' : ''} ${isDemo(VACUUM.entity) ? 'demo' : ''}" data-app="vacuum" style="left:${x}px;top:${y}px" aria-label="${t('Robot vacuum')}, ${t(v.state)}"><i class="bot" style="transform:rotate(${vacHeading().toFixed(0)}deg)"><b></b></i></button>`;
    const d = dishwasher(), [dx, dy] = P(DISHWASHER.pos[0], DISHWASHER.pos[1]);
    h += `<button class="mk appl ${d.running ? 'run' : ''} ${isDemo(DISHWASHER.status) ? 'demo' : ''}" data-app="dishwasher" style="left:${dx}px;top:${dy}px" aria-label="${t('Dishwasher')}, ${esc(d.status)}">${d.running ? ring(d.frac) : ''}<span class="ms">dishwasher_gen</span></button>`;
  }
  if (mode === 'blinds') for (const b of BLINDS) {
    const spot = house.blindSpot.get(b.id); if (!onFloor(b.room) || !spot) continue;
    const p = blindP(b), [x, y] = P(spot[0], spot[1], ROOMS[b.room].floor);
    h += `<button class="mk blind ${p < 50 ? 'closed' : ''} ${isDemo(b.entity) ? 'demo' : ''}" data-b="${b.id}" style="left:${x}px;top:${y}px" aria-label="${t('{name}, {p}% open', { name: t(b.name), p })}"><span class="ms">${p < 50 ? 'roller_shades_closed' : 'roller_shades'}</span></button>`;
  }
  if (mode === 'rooms') for (const [id, r] of Object.entries(ROOMS)) {
    if (!shows(r.floor)) continue;
    const [x0, z0, x1, z1] = r.r, [x, y] = P((x0 + x1) / 2, (z0 + z1) / 2, r.floor), s = roomStats(id);
    h += `<button class="mk room ${selRoom === id ? 'sel' : ''}" data-r="${id}" style="left:${x}px;top:${y}px"><span class="ri"><span class="ms">${r.icon}</span></span><span>${t(r.name)}<small>${[s.n ? (s.on ? t('{n} on', { n: s.on }) : t('Lights off')) : '', roomTempTxt(id)].filter(Boolean).join(' · ')}${s.n && LIGHTS.filter((l) => l.room === id).every((l) => isDemo(l.entity)) ? '<span class="demo-tag">demo</span>' : ''}</small></span></button>`;
  }
  setHtml($('marks'), 'marks', h);
  let o = '';
  if (mode === 'rooms') for (const [id, r] of Object.entries(ROOMS)) {
    if (!shows(r.floor)) continue;
    const [x0, z0, x1, z1] = r.r, i = .14;
    const pts = [[x0 + i, z0 + i], [x1 - i, z0 + i], [x1 - i, z1 - i], [x0 + i, z1 - i]].map(([x, z]) => P(x, z, r.floor).map((v) => v.toFixed(1)).join(',')).join(' ');
    o += `<polygon points="${pts}" fill="${selRoom === id ? 'rgba(255,255,255,.07)' : 'none'}" stroke="#fff" stroke-opacity="${selRoom === id ? 1 : .5}" stroke-width="2" stroke-dasharray="7 5" stroke-linejoin="round"/>`;
  }
  if ((mode === 'lights' || mode === 'appliances' || mode === 'device') && shows('ground')) {
    // the robot cleans a ~30 cm wide strip: draw that as a soft band, with the smoothed route as a hairline on top
    const [ax] = house.project(2.9, .02, 3.7), [bx] = house.project(3.2, .02, 3.7), brush = Math.abs(bx - ax);
    const v = vacuum(), live = v.cleaning || v.state === 'returning' || v.state === 'paused';
    let swath = '', line = '';
    for (const l of vacTrail()) {
      const pts: [number, number][] = [];
      for (const [x, z] of l) { const q = house.project(x, .02, z); const p = pts[pts.length - 1]; if (!p || Math.hypot(q[0] - p[0], q[1] - p[1]) > 2.5) pts.push(q); }
      if (pts.length < 2) continue;
      // quadratic curves through the midpoints: smooth corners without drifting off the real route
      let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
      for (let i = 1; i < pts.length - 1; i++) d += ` Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1)},${((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1)}`;
      d += ` L${pts[pts.length - 1][0].toFixed(1)},${pts[pts.length - 1][1].toFixed(1)}`;
      swath += d + ' '; line += d + ' ';
    }
    if (swath) o += `<g class="vclean ${live ? 'live' : 'done'}"><path class="vswath" d="${swath}" stroke-width="${brush.toFixed(1)}"/><path class="vline" d="${line}"/></g>`;
  }
  setHtml($('outlines'), 'outlines', o);
  for (const b of document.querySelectorAll<HTMLElement>('#floors [data-f]')) b.setAttribute('aria-pressed', String(b.dataset.f === floor));
  $('floors').hidden = house.dual;
}

function renderChips() {
  const temp = store.num(CLIMATE.indoorTemp), hum = store.num(CLIMATE.humidity), w = store.num(ENERGY.power), p = store.num(ENERGY.price);
  const lvl = Number.isFinite(p) ? priceLevel(p) : 'mid', day = isDay();
  setHtml($('chips'), 'chips',
    (Number.isFinite(temp) ? `<span class="chip ${isDemo(CLIMATE.indoorTemp) ? 'demo' : ''}"><span class="ms">device_thermostat</span>${temp.toFixed(1)}°${demoTag(CLIMATE.indoorTemp)}</span>` : '') +
    (Number.isFinite(hum) ? `<span class="chip ${isDemo(CLIMATE.humidity) ? 'demo' : ''}"><span class="ms">humidity_percentage</span>${Math.round(hum)}%${demoTag(CLIMATE.humidity)}</span>` : '') +
    (Number.isFinite(w) ? `<span class="chip ${isDemo(ENERGY.power) ? 'demo' : ''}"><span class="ms">bolt</span>${Math.round(w)} W${demoTag(ENERGY.power)}</span>` : '') +
    (Number.isFinite(p) ? `<span class="chip" title="${t('Electricity price now')}"><i style="background:var(--${lvl})"></i>${p.toFixed(2)} kr/kWh</span>` : '') +
    (sunDemo ? `<button class="chip btn run" id="sunchip" title="${t('Stop the demo')}"><span class="ms">${day ? 'light_mode' : 'dark_mode'}</span>${t('Running day/night demo · {time}', { time: fmtDemoTime(sunDemoTime()) })}</button>`
      : `<button class="chip btn" id="sunchip" title="${t('Play a whole day in 30 seconds')}"><span class="ms">${day ? 'light_mode' : 'dark_mode'}</span>${t(day ? 'Day' : 'Evening')}</button>`));
}

function renderToday() {
  const el = $('today');
  // both floors on screen and no room beside them: the card moves into the sidebar
  const inSide = house.dual && !house.reserveUsed, slot = inSide ? $('todaySlot') : $('stage');
  if (el.parentElement !== slot) slot.appendChild(el);
  el.classList.toggle('inside', inSide);
  el.hidden = mode !== 'lights' || !shows('ground');
  if (el.hidden) return;
  const d = dishwasher(), v = vacuum();
  const dwSub = d.running ? t('{dur} left · done {time}', { dur: dur(d.remaining), time: fmtTime(new Date(Date.now() + d.remaining * 60e3)) })
    : d.attention ? t('Needs attention · check the dishwasher')
    : dwBlocker(d) || ((d.delayed || d.loaded) && d.planned ? t('Starts {time} · cheapest', { time: fmtTime(d.planned) }) + (d.plannedPrice && !d.delayed ? ` (${d.plannedPrice.toFixed(2)} kr/kWh)` : '')
    : d.finished ? t('Clean dishes · ready to empty') : t('Load it, then tap "Run at cheapest time"'));
  const dwPill = d.running ? `<span class="pillst run">${t('Running')}</span>` : d.delayed ? `<span class="pillst ok">${t('Planned')}</span>` : d.loaded ? `<span class="pillst">${t('Waiting')}</span>` : d.finished ? `<span class="pillst ok">${t('Done')}</span>` : `<span class="pillst">${t('Idle')}</span>`;
  const vSub = v.cleaning || v.state === 'returning' || v.state === 'starting' || v.state === 'paused' ? vacLabel(v)
    : `${t(v.auto ? 'Cleans when you’re both out' : 'Auto-clean is off')}${v.last ? t(' · last {ago}', { ago: ago(v.last) }) : ''}`;
  const vPill = v.cleaning ? `<span class="pillst run">${t('Cleaning')}</span>` : v.auto ? `<span class="pillst ok">${t('Auto')}</span>` : `<span class="pillst">${t('Manual')}</span>`;
  const sunset = store.get('sun.sun')?.attributes.next_setting;
  setHtml(el, 'today', `<h3>${t('Today')} <span>${new Date().toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}</span></h3>
    <button class="auto" data-go="appliances"><span class="ai ${d.running ? 'act' : ''}"><span class="ms">dishwasher_gen</span></span><div><b>${t('Dishwasher')}${demoTag(DISHWASHER.status)}</b><small>${dwSub}</small></div>${dwPill}</button>
    <button class="auto" data-go="appliances"><span class="ai ${v.cleaning ? 'act' : ''}"><span class="ms">cleaning_services</span></span><div><b>${t('Robot vacuum')}</b><small>${vSub}</small></div>${vPill}</button>
    <button class="auto" data-go="blinds"><span class="ai"><span class="ms">roller_shades_closed</span></span><div><b>${t('Blinds')}${BLINDS.every((b) => isDemo(b.entity)) ? '<span class="demo-tag">demo</span>' : ''}</b><small>${t('Close at sunset · {time}', { time: sunset ? fmtTime(new Date(sunset)) : '18:22' })}</small></div><span class="pillst ok">${t('Auto')}</span></button>`);
}

/* ---------------- middle panel ---------------- */
const lightRow = (L: LightDef) => { const s = light(L); return `<div class="row"><button class="icob ${s.on ? 'on' : ''}" data-tl="${L.id}" aria-label="${t('Toggle {name}', { name: t(L.name) })}"><span class="ms">${L.icon}</span></button>
  <div class="rmain"><div class="rname"><span style="color:var(--fg)">${t(L.name)}${demoTag(L.entity)}</span><span id="lv-${L.id}">${s.offline ? t('Offline · no power?') : s.on ? s.b + '%' : t('Off')}</span></div><input type="range" class="pill" data-sl="${L.id}" min="1" max="100" step="1" value="${s.b}" style="--p:${s.on ? s.b : 0}%" aria-label="${t('{name} brightness', { name: t(L.name) })}"></div></div>`; };
const bTxt = (p: number) => p === 0 ? t('Closed') : p === 100 ? t('Open') : p + '%';
const blindRow = (b: BlindDef) => { const p = blindP(b); return `<div class="row"><button class="icob bl" data-tb="${b.id}" aria-label="${t(p < 50 ? 'Open {name}' : 'Close {name}', { name: t(b.name) })}"><span class="ms">${p < 50 ? 'roller_shades_closed' : 'roller_shades'}</span></button>
  <div class="rmain"><div class="rname"><span style="color:var(--fg)">${t(b.name)}${demoTag(b.entity)}</span><span id="bv-${b.id}">${bTxt(p)}</span></div><input type="range" class="pill" data-sb="${b.id}" min="0" max="100" step="5" value="${p}" style="--p:${p}%;--fillc:#9ec4f5" aria-label="${t('{name} position', { name: t(b.name) })}"></div></div>`; };
const ph = (icon: string, title: string, sub: string, extra = '') => `<div class="ph"><div class="badge" style="position:relative">${extra}<span class="ms">${icon}</span></div><h2>${title}</h2><p>${sub}</p></div>`;

let energy: { usage: HourValue[]; live: boolean; at: number } | null = null;
/** the latest day the meter has reported to Eloverblik (usually yesterday), hour by hour */
function meteredDay(): { date: Date; usage: HourValue[] } | null {
  const tot = store.get(ENERGY.meteredTotal);
  if (!store.isLive(ENERGY.meteredTotal) || !tot?.attributes.metering_date) return null;
  const date = new Date(tot.attributes.metering_date + 'T00:00:00');
  const usage = Array.from({ length: 24 }, (_, h) => ({ start: date.getTime() + h * 3600e3, value: store.num(ENERGY.meteredHour(h), 0) }));
  return Number.isFinite(date.getTime()) ? { date, usage } : null;
}
async function loadEnergy() {
  if (energy && Date.now() - energy.at < 5 * 60e3) return;
  const m = meteredDay(); if (m) { energy = { usage: m.usage, live: true, at: Date.now() }; renderPanel(); return; }
  const r = await store.hourlyStats(ENERGY.energy, 24);
  energy = { usage: r.data, live: r.live, at: Date.now() };
  renderPanel();
}

/* ---------------- device panel: everything a Home Assistant device offers ----------------
   Lists every entity on the device with a control that fits its domain: switches toggle, selects pick, numbers set,
   buttons press (after a confirm), sensors and binary sensors read. Grouped like Home Assistant's own device page. */
let devView: { entity: string; title: string; ids: { id: string; category: string | null }[] | null } | null = null;
let devBack: Mode = 'appliances';
const allControls = (entity: string, title: string) => store.isLive(entity)
  ? `<button class="sbtn wide" data-dev="${entity}" data-dev-title="${esc(title)}"><span class="ms">tune</span>${t('All controls')}</button>` : '';
/** where a device sits on the floorplan, for zooming in while its panel is open */
function devicePlace(entity: string): { x: number; z: number; floor: Floor } | null {
  if (entity === DISHWASHER.status) return { x: DISHWASHER.pos[0], z: DISHWASHER.pos[1], floor: 'ground' };
  if (entity === TV.entity) return { x: 4.9, z: 3.7, floor: 'ground' };
  if (entity === VACUUM.entity) { const [x, z] = vacLive() ?? VACUUM.dock; return { x, z, floor: VACUUM.floor }; }
  const L = LIGHTS.find((l) => l.entity === entity); if (L) return { x: L.pos[0][0], z: L.pos[0][2], floor: ROOMS[L.room].floor };
  return null;
}
async function openDevice(entity: string, title: string) {
  if (mode !== 'device') devBack = mode;
  mode = 'device'; devView = { entity, title, ids: null };
  const at = devicePlace(entity); if (at) { if (!house.visibleFloors().includes(at.floor)) setFloor(at.floor); house.focus(at); }
  renderAll();
  const ids = await store.deviceEntities(entity);
  if (devView?.entity === entity) { devView.ids = ids ?? []; lastHtml.panel = ''; renderAll(); }
}
/** 'dishcare_dishwasher_program_eco_50' → 'Eco 50', 'delayedstart' → 'Delayedstart', 'not_home' → 'Not home' */
const pretty = (v: string) => { const s = String(v).replace(/^.*_(program|programme|option|setting|state)_/, '').replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
function devValue(e: HassEntity): string {
  const a = e.attributes, s = e.state;
  if (s === 'unavailable' || s === 'unknown') return `<span class="dim">${t(s === 'unknown' ? '–' : 'unavailable')}</span>`;
  if (a.device_class === 'timestamp') { const d = new Date(s); return Number.isFinite(d.getTime()) ? esc(d.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' })) : esc(s); }
  if (e.entity_id.startsWith('binary_sensor.')) {
    const on = s === 'on', dc = a.device_class as string | undefined;
    const words: Record<string, [string, string]> = { door: ['Open', 'Closed'], window: ['Open', 'Closed'], opening: ['Open', 'Closed'], connectivity: ['Connected', 'Disconnected'], problem: ['Problem', 'OK'], battery_charging: ['Charging', 'Not charging'], running: ['Running', 'Not running'] };
    const [y, n] = (dc && words[dc]) || ['On', 'Off']; return t(on ? y : n);
  }
  const num = Number(s);
  const val = Number.isFinite(num) && s.trim() !== '' ? (Math.abs(num) >= 100 || Number.isInteger(num) ? String(Math.round(num * 10) / 10) : num.toFixed(2)) : pretty(s);
  return esc(val) + (a.unit_of_measurement ? ` <em>${esc(a.unit_of_measurement)}</em>` : '');
}
function devControl(e: HassEntity, name: string): string {
  const id = e.entity_id, dom = id.split('.')[0], a = e.attributes, off = e.state === 'unavailable';
  if (dom === 'switch' || dom === 'input_boolean' || dom === 'fan' || dom === 'siren')
    return `<button class="toggle dev" data-dtoggle="${id}" ${off ? 'disabled' : ''}><span>${esc(name)}</span><span class="sw ${e.state === 'on' ? 'on' : ''}"></span></button>`;
  if (dom === 'select' || dom === 'input_select') {
    const opts = (a.options as string[] | undefined) ?? [];
    return `<label class="drow"><span>${esc(name)}</span><select data-dsel="${id}" ${off ? 'disabled' : ''}>${e.state === 'unknown' ? `<option value="" selected>–</option>` : ''}${opts.map((o) => `<option value="${esc(o)}" ${o === e.state ? 'selected' : ''}>${esc(pretty(o))}</option>`).join('')}</select></label>`;
  }
  if (dom === 'number' || dom === 'input_number')
    return `<label class="drow"><span>${esc(name)}</span><span><input type="number" data-dnum="${id}" min="${a.min ?? ''}" max="${a.max ?? ''}" step="${a.step ?? 1}" value="${esc(e.state)}" ${off ? 'disabled' : ''}>${a.unit_of_measurement ? ` <em>${esc(a.unit_of_measurement)}</em>` : ''}</span></label>`;
  if (dom === 'button' || dom === 'script')
    return `<div class="drow"><span>${esc(name)}</span><button class="sbtn mini" data-dpress="${id}" data-dname="${esc(name)}" ${off ? 'disabled' : ''}>${t(dom === 'script' ? 'Run' : 'Press')}</button></div>`;
  if ((dom === 'image' || dom === 'camera') && a.entity_picture)
    return `<div class="dimg"><span>${esc(name)}</span><img src="${esc(store.url(a.entity_picture))}" alt=""></div>`;
  return `<div class="drow"><span>${esc(name)}</span><b>${devValue(e)}</b></div>`;
}
function devicePanel(): string {
  if (!devView) return '';
  const back = `<button class="sbtn mini back" data-back="1"><span class="ms">arrow_back</span>${t('Back')}</button>`;
  if (!devView.ids) return `${back}<div class="ph"><h2>${esc(devView.title)}</h2><p>${t('Loading…')}</p></div>`;
  const ents = devView.ids.map((x) => ({ ...x, e: store.get(x.id) })).filter((x): x is { id: string; category: string | null; e: HassEntity } => !!x.e);
  if (!ents.length) return `${back}<div class="ph"><h2>${esc(devView.title)}</h2><p>${t('Connect Home Assistant to see every control')}</p></div>`;
  // drop the device name that Home Assistant puts in front of every entity name ("Dishwasher Door" → "Door")
  const names = ents.map((x) => String(x.e.attributes.friendly_name ?? x.id));
  let pre = names[0].split(' ');
  for (const n of names.slice(1)) { const w = n.split(' '); let i = 0; while (i < pre.length && w[i] === pre[i]) i++; pre = pre.slice(0, i); }
  const nameOf = (n: string) => { const rest = n.split(' ').slice(pre.length).join(' '); return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : n; };
  const isControl = (id: string) => /^(switch|select|number|button|script|input_boolean|input_select|input_number|fan|siren)\./.test(id);
  const groups: [string, typeof ents][] = [
    ['Controls', ents.filter((x) => !x.category && isControl(x.id))],
    ['Status', ents.filter((x) => !x.category && !isControl(x.id))],
    ['Settings', ents.filter((x) => x.category === 'config')],
    ['Diagnostics', ents.filter((x) => x.category === 'diagnostic')],
  ];
  return `${back}<div class="ph"><h2>${esc(devView.title)}</h2><p>${t('{n} entities from Home Assistant', { n: ents.length })}</p></div>` +
    groups.filter(([, g]) => g.length).map(([title, g]) => `<div class="devh">${t(title)}</div><div class="dgroup">${g.sort((p, q) => nameOf(String(p.e.attributes.friendly_name)).localeCompare(nameOf(String(q.e.attributes.friendly_name)))).map((x) => devControl(x.e, nameOf(String(x.e.attributes.friendly_name ?? x.id)))).join('')}</div>`).join('');
}

function renderPanel() {
  const wrap = $('panelwrap'), P = $('panel');
  if (mode === 'lights') { wrap.hidden = true; return; }
  wrap.hidden = false;
  P.classList.toggle('wide', mode === 'energy');
  if (dragging) return;
  if (mode === 'device' && P.contains(document.activeElement) && document.activeElement?.matches('select, input')) return;
  let h = '';
  if (mode === 'rooms') {
    if (!selRoom) {
      h = ph('space_dashboard', t('Control rooms'), t(FLOORS[floor])) + `<p class="hint">${t('Select a room on the floorplan to control its lights and blinds.')}</p>
      <div class="rows">${Object.entries(ROOMS).filter(([, r]) => r.floor === floor).map(([id, r]) => { const s = roomStats(id); return `<button class="tile wide" data-sr="${id}" style="justify-content:flex-start;padding:10px 12px;gap:10px"><span class="ms">${r.icon}</span><span style="flex:1;text-align:left;color:var(--fg)">${t(r.name)}</span><span>${s.on ? t('{n} on', { n: s.on }) : t('Lights off')}</span></button>`; }).join('')}</div>`;
    } else {
      const r = ROOMS[selRoom], s = roomStats(selRoom), ls = LIGHTS.filter((l) => l.room === selRoom), bs = BLINDS.filter((b) => b.room === selRoom);
      h = ph(r.icon, t(r.name), (Number.isFinite(roomTemp(selRoom)) ? roomTempTxt(selRoom).replace('°', ' °C') + ' · ' : '') + t('{on} of {n} lights on', { on: s.on, n: s.n })) + `<div class="rows">${ls.map(lightRow).join('')}${bs.map(blindRow).join('')}</div>
      <div class="tiles"><button class="tile" data-room-all="1"><span class="ms">lightbulb</span>${t('All on')}</button><button class="tile" data-room-all="0"><span class="ms">light_off</span>${t('All off')}</button>
      ${bs.length ? `<button class="tile" data-room-bl="100"><span class="ms">roller_shades</span>${t('Open blinds')}</button><button class="tile" data-room-bl="0"><span class="ms">roller_shades_closed</span>${t('Close blinds')}</button>` : ''}</div>`;
    }
  }
  if (mode === 'scenes') h = ph('auto_awesome', t('Scenes'), t('{n} lights on in the house', { n: LIGHTS.filter((l) => light(l).on).length }) + (LIGHTS.some((l) => isDemo(l.entity)) ? `<span class="demo-tag">${t('mostly demo lights')}</span>` : '')) + `<p class="hint">${t('Tap a scene to set the whole house at once.')}</p>
    <div class="tiles">${SCENES.map((s) => `<button class="tile" data-scene="${s.entity}"><span class="ms">${s.icon}</span>${t(s.name)}</button>`).join('')}</div>`;
  if (mode === 'blinds') h = ph('roller_shades', t('Blinds'), t('{o} of {n} open', { o: BLINDS.filter((b) => blindP(b) >= 50).length, n: BLINDS.length }) + (BLINDS.every((b) => isDemo(b.entity)) ? '<span class="demo-tag">demo</span>' : '')) + `<div class="rows">${BLINDS.map(blindRow).join('')}</div>
    <div class="tiles"><button class="tile" data-all-bl="100"><span class="ms">roller_shades</span>${t('Open all')}</button><button class="tile" data-all-bl="0"><span class="ms">roller_shades_closed</span>${t('Close all')}</button></div>`;
  if (mode === 'media') { const t = tv(), tr = (x: string) => window.__t(x); h = ph('tv', tr(TV.name), (t.on ? `${tr(t.playing ? 'Playing' : 'On')} · ${esc(t.title ? `${t.app} · ${t.title}` : t.app)}` : tr('Off')) + demoTag(TV.entity)) + `
    <div class="apps">${TV.apps.map((a) => `<button class="app ${t.on && t.app === a.name ? 'sel' : ''}" data-app-src="${a.id}">${a.name}</button>`).join('')}</div>
    <div class="rows"><div class="row"><span class="icob"><span class="ms">volume_up</span></span><div class="rmain"><div class="rname">${tr('Volume')}<span id="tvv">${t.vol}</span></div><div class="bar"><i style="width:${t.vol}%"></i></div></div></div></div>
    <div class="tiles"><button class="tile ${t.on ? 'sel' : ''}" data-tv-power="1"><span class="ms">power_settings_new</span>${tr(t.on ? 'Turn off' : 'Turn on')}</button><button class="tile" data-tv-play="1"><span class="ms">${t.playing ? 'pause' : 'play_arrow'}</span>${tr(t.playing ? 'Pause' : 'Play')}</button>
    <button class="tile" data-tv-vol="-4"><span class="ms">volume_down</span>${tr('Quieter')}</button><button class="tile" data-tv-vol="4"><span class="ms">volume_up</span>${tr('Louder')}</button></div>${allControls(TV.entity, tr(TV.name))}`; }
  if (mode === 'appliances') {
    const v = vacuum(), d = dishwasher(), pNow = store.num(ENERGY.price);
    const saving = d.planned && d.plannedPrice && Number.isFinite(pNow) ? (pNow - d.plannedPrice) * DISHWASHER_KWH : 0;
    const vb = (cmd: string, icon: string, label: string, pri = false) => `<button class="sbtn ${pri ? 'pri' : ''}" data-vac="${cmd}"><span class="ms">${icon}</span>${t(label)}</button>`;
    const vBtns = v.state === 'starting' ? `<button class="sbtn pri" disabled><span class="ms">hourglass_top</span>${t('Starting…')}</button>`
      : v.cleaning ? vb('pause', 'pause', 'Pause') + vb('return_to_base', 'home', 'Dock')
      : v.state === 'returning' ? vb('start', 'play_arrow', 'Clean', true) + vb('pause', 'pause', 'Pause')
      : v.docked ? vb('start', 'play_arrow', 'Clean', true)
      : vb('start', 'play_arrow', v.state === 'paused' ? 'Resume' : 'Clean', true) + vb('return_to_base', 'home', 'Dock');
    h = `<div class="card"><div class="top"><span class="big">${v.cleaning && v.hasProgress ? ring(v.progress, 62, 3) : ''}<span class="ms">cleaning_services</span></span><div><b>${t(VACUUM.name)}${demoTag(VACUUM.entity)}</b>
      <small>${vacLabel(v)}${Number.isFinite(v.battery) ? t(' · {b}% battery', { b: Math.round(v.battery) }) : ''}</small></div></div>
      ${v.cleaning && v.hasProgress ? `<div class="bar"><i style="width:${Math.round(v.progress * 100)}%"></i></div>` : ''}
      <div class="btnrow flex">${vBtns}</div>
      <button class="toggle" data-ib="${VACUUM_HELPERS.autoClean}"><span>${t('Clean when we’re both out')}<small>${v.last ? t('Last cleaned {ago}', { ago: ago(v.last) }) : t('No clean logged yet')}${t(' · once a day, 09–18')}</small></span><span class="sw ${v.auto ? 'on' : ''}"></span></button>${allControls(VACUUM.entity, VACUUM.name)}</div>
    <div class="card"><div class="top"><span class="big">${d.running ? ring(d.frac, 62, 3) : ''}<span class="ms">dishwasher_gen</span></span><div><b>${t(DISHWASHER.name)}${demoTag(DISHWASHER.status)}</b>
      <small>${d.running ? t('Running · {dur} left', { dur: dur(d.remaining) }) : d.delayed && d.planned ? t('Starts {time} · cheapest', { time: fmtTime(d.planned) }) : d.attention ? t('Needs attention · check the dishwasher') : t(d.finished ? 'Finished · ready to empty' : d.loaded ? 'Loaded' : d.status === 'inactive' ? 'Off' : 'Ready')}${d.doorOpen ? t(' · door open') : ''}</small></div></div>
      ${d.running ? `<div class="bar"><i style="width:${Math.round(d.frac * 100)}%"></i></div>` : ''}
      <button class="toggle" data-ib="${DISHWASHER.loaded}"><span>${t('Run at cheapest time')}<small>${dwBlocker(d) ? dwBlocker(d) : d.loaded && d.planned ? t('Starts {time} · {price} kr/kWh', { time: fmtTime(d.planned), price: d.plannedPrice?.toFixed(2) ?? '–' }) + (saving > 0.05 ? t(' · saves {kr}', { kr: fmtKr(saving) }) : '') : t('Done by 07:00, using tonight’s prices')}</small></span><span class="sw ${d.loaded ? 'on' : ''}"></span></button>
      <div class="btnrow two"><button class="sbtn ${d.running || d.delayed ? '' : 'pri'}" data-dw="start" ${d.running || d.delayed ? 'disabled' : ''}><span class="ms">play_arrow</span>${t('Start now')}</button><button class="sbtn" data-go="energy"><span class="ms">bolt</span>${t('See prices')}</button></div>${allControls(DISHWASHER.status, DISHWASHER.name)}</div>
    <p class="hint">${t('Runs {d}× dishwasher · {v}× vacuum this week', { d: store.num(STATS.dishwasherRuns, 4), v: store.num(STATS.vacuumRuns, 6) })}</p>`;
  }
  if (mode === 'energy') {
    if (!energy) loadEnergy();
    const ps = prices(), pNow = store.num(ENERGY.price), w = store.num(ENERGY.power);
    const metered = meteredDay(), usage = metered?.usage ?? energy?.usage ?? [];
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    // with Eloverblik the totals are for the metered day; its cost is estimated with today's price for the same hour
    const today = metered ? usage : usage.filter((u) => u.start >= midnight.getTime());
    const dayLbl = metered ? metered.date.toLocaleDateString(locale(), { weekday: 'long' }) : '';
    const kwh = today.reduce((s, u) => s + u.value, 0);
    const priceAt = (t: number) => ps.find((p) => new Date(p.hour).getHours() === new Date(t).getHours())?.price ?? pNow;
    const cost = today.reduce((s, u) => s + u.value * priceAt(u.start), 0);
    const d = dishwasher(), planned = new Set<number>();
    if ((d.loaded || d.delayed) && d.planned) for (let i = 0; i < DISHWASHER.runHours; i++) { const t = new Date(d.planned.getTime() + i * 3600e3); if (t.getDate() === new Date().getDate()) planned.add(t.getHours()); }
    const cheapest = [...ps].filter((p) => new Date(p.hour).getHours() >= new Date().getHours()).sort((a, b) => a.price - b.price)[0];
    h = `<div class="ph" style="align-items:flex-start;text-align:left"><h2>${t('Energy')}</h2><p>${t(metered ? 'Live prices · use from Eloverblik, a day behind' : energy?.live ? 'From Home Assistant statistics' : 'Demo data until the meter and prices are connected')}</p></div>
    <div class="kpis"><div class="kpi"><small>${t('Using now')}${demoTag(ENERGY.power)}</small><b>${Number.isFinite(w) ? Math.round(w) : '–'}<em>W</em></b></div><div class="kpi"><small>${t('Price now')}</small><b style="color:var(--${priceLevel(pNow)})">${Number.isFinite(pNow) ? pNow.toFixed(2) : '–'}<em>kr/kWh</em></b></div>
    <div class="kpi"><small>${metered ? t('Used {day}', { day: dayLbl }) : t('Used today')}</small><b>${kwh.toFixed(1)}<em>kWh</em></b></div><div class="kpi"><small>${metered ? t('Cost {day}', { day: dayLbl }) : t('Cost today')}</small><b>${metered ? '≈ ' : ''}${cost.toFixed(2)}<em>kr</em></b></div></div>
    <div class="chart"><h4>${t('Electricity price today')}<span>${cheapest ? t('Cheapest ahead {h}:00 · {p} kr', { h: String(new Date(cheapest.hour).getHours()).padStart(2, '0'), p: cheapest.price.toFixed(2) }) : ''}</span></h4>${priceChart(ps, planned)}
      <div class="legend"><span><i style="background:var(--cheap)"></i>${t('Cheap')}</span><span><i style="background:var(--mid)"></i>${t('Normal')}</span><span><i style="background:var(--dear)"></i>${t('Expensive')}</span>${planned.size ? `<span><i style="background:var(--cool);border-radius:50%"></i>${t('Dishwasher planned')}</span>` : ''}</div></div>
    <div class="chart"><h4>${t('Use per hour')}<span>${metered ? esc(dayLbl) : t('last 24 hours')}</span></h4>${usageChart(usage)}</div>
    <div class="kpis"><div class="kpi"><small>${t('Dishwasher this week')}</small><b>${store.num(STATS.dishwasherRuns, 4)}<em>${t('runs')}</em></b></div><div class="kpi"><small>${t('Robot vacuum this week')}</small><b>${store.num(STATS.vacuumRuns, 6)}<em>${t('cleans')}</em></b></div></div>`;
  }
  if (mode === 'devices') h = ph('devices', t('All devices'), t('{l} lights · {b} blinds · 3 appliances', { l: LIGHTS.length, b: BLINDS.length })) + '<div>' +
    Object.entries(ROOMS).map(([id, r]) => `<div class="devh">${t(FLOORS[r.floor])} · ${t(r.name)}</div>` +
      LIGHTS.filter((l) => l.room === id).map((l) => { const s = light(l); return `<div class="dev"><span>${t(l.name)}${demoTag(l.entity)}</span><span>${s.offline ? t('Offline · no power?') : s.on ? s.b + '% · ' + s.k + ' K' : t('Off')}</span></div>`; }).join('') +
      BLINDS.filter((b) => b.room === id).map((b) => `<div class="dev"><span>${t(b.name)}${demoTag(b.entity)}</span><span>${bTxt(blindP(b))}</span></div>`).join('') +
      (id === 'living' ? `<div class="dev"><span>${t('TV')}${demoTag(TV.entity)}</span><span>${tv().on ? esc(tv().app) : t('Off')}</span></div><div class="dev"><span>${t('Robot vacuum')}${demoTag(VACUUM.entity)}</span><span>${esc(t(vacuum().state))}</span></div>` : '') +
      (id === 'kitchen' ? `<div class="dev"><span>${t('Dishwasher')}${demoTag(DISHWASHER.status)}</span><span>${esc(dishwasher().status)}</span></div>` : '')).join('') + '</div>';
  if (mode === 'device') h = devicePanel();
  setHtml(P, 'panel', h);
}

/* ---------------- light popover ---------------- */
function openPop(id: string) {
  popId = id; syncPop();
  const L = LIGHTS.find((l) => l.id === id)!, [x, y] = house.project(L.pos[0][0], 2.5, L.pos[0][2], ROOMS[L.room].floor);
  const pop = $('pop'); pop.hidden = false; const w = 260, h = pop.offsetHeight || 170;
  pop.style.left = Math.min(house.W - w - 10, Math.max(10, x - w / 2)) + 'px';
  pop.style.top = (y - h - 30 > 10 ? y - h - 30 : Math.min(house.H - h - 10, y + 30)) + 'px';
}
function syncPop() {
  const L = LIGHTS.find((l) => l.id === popId); if (!L) return; const s = light(L);
  $('popIcon').textContent = L.icon; $('popName').textContent = `${t(ROOMS[L.room].name)} · ${t(L.name)}`;
  $('popSub').textContent = s.on ? `${s.b}% · ${s.k} K` : t('Off'); $('popSw').classList.toggle('on', s.on);
  if (!dragging) { ($('popBri') as HTMLInputElement).value = String(s.b); setP($('popBri') as HTMLInputElement); ($('popK') as HTMLInputElement).value = String(s.k); }
}
function closePop() { popId = null; $('pop').hidden = true; }
function setP(el: HTMLInputElement) { const min = +el.min, max = +el.max; el.style.setProperty('--p', ((+el.value - min) / (max - min)) * 100 + '%'); }

/* ---------------- actions ---------------- */
const throttle = new Map<string, number>();
function lightTurnOn(L: LightDef, data: Record<string, any>, force = false) {
  const now = performance.now(); if (!force && now - (throttle.get(L.entity) ?? 0) < 180) return; throttle.set(L.entity, now);
  store.call('light', 'turn_on', { entity_id: L.entity, ...data });
}
const toggleLight = (L: LightDef) => store.call('light', light(L).on ? 'turn_off' : 'turn_on', { entity_id: L.entity });
const setBlind = (b: BlindDef, p: number) => store.call('cover', 'set_cover_position', { entity_id: b.entity, position: p });

function bind() {
  $('menu').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.mi'); if (!b) return;
    mode = b.dataset.m as Mode; if (mode !== 'rooms') selRoom = null;
    devView = null; house.focus(null);
    if ((mode === 'media' || mode === 'appliances') && floor !== 'ground') setFloor('ground');
    if (mode === 'energy') loadEnergy();
    closePop(); renderAll();
  });
  $('floors').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]'); if (b && b.dataset.f !== floor) { selRoom = null; setFloor(b.dataset.f as Floor); } });
  $('chips').addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('#sunchip')) { if (sunDemo) stopSunDemo(); else startSunDemo(); } });
  $('today').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]'); if (b) { mode = b.dataset.go as Mode; renderAll(); } });

  // markers: tap toggles, long-press (or right-click) opens the light controls
  let pressT = 0, longFired = false;
  const marks = $('marks');
  marks.addEventListener('pointerdown', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-l]'); longFired = false; if (!b) return; pressT = window.setTimeout(() => { longFired = true; openPop(b.dataset.l!); }, 430); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) marks.addEventListener(ev, () => clearTimeout(pressT));
  marks.addEventListener('contextmenu', (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-l]'); if (b) { e.preventDefault(); openPop(b.dataset.l!); } });
  marks.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.mk'); if (!t) return; const d = t.dataset;
    if (d.l) { if (longFired) { longFired = false; return; } toggleLight(LIGHTS.find((l) => l.id === d.l)!); }
    if (d.tv) store.call('media_player', tv().on ? 'turn_off' : 'turn_on', { entity_id: TV.entity });
    if (d.b) { const b = BLINDS.find((x) => x.id === d.b)!; setBlind(b, blindP(b) < 50 ? 100 : 0); }
    if (d.r) selRoom = d.r;
    if (d.app) mode = 'appliances';
    renderAll();
  });

  $('popSw').addEventListener('click', () => { toggleLight(LIGHTS.find((l) => l.id === popId)!); });
  $('popBri').addEventListener('input', (e) => { const el = e.target as HTMLInputElement; setP(el); lightTurnOn(LIGHTS.find((l) => l.id === popId)!, { brightness_pct: +el.value }); });
  $('popBri').addEventListener('change', (e) => lightTurnOn(LIGHTS.find((l) => l.id === popId)!, { brightness_pct: +(e.target as HTMLInputElement).value }, true));
  $('popK').addEventListener('change', (e) => lightTurnOn(LIGHTS.find((l) => l.id === popId)!, { color_temp_kelvin: +(e.target as HTMLInputElement).value }, true));
  document.addEventListener('pointerdown', (e) => { const t = e.target as HTMLElement; if (popId && !t.closest('#pop') && !t.closest('[data-l]')) closePop(); });
  // pause panel re-renders while a slider is held, so live updates don't yank it away
  document.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).matches('input[type=range]')) dragging = true; });
  document.addEventListener('pointerup', () => { if (dragging) { dragging = false; setTimeout(renderAll, 400); } });

  const P = $('panel');
  P.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!t) return; const d = t.dataset;
    if (d.sr) selRoom = d.sr;
    if (d.tl) toggleLight(LIGHTS.find((l) => l.id === d.tl)!);
    if (d.tb) { const b = BLINDS.find((x) => x.id === d.tb)!; setBlind(b, blindP(b) < 50 ? 100 : 0); }
    if (d.roomAll !== undefined) store.call('light', d.roomAll === '1' ? 'turn_on' : 'turn_off', { entity_id: LIGHTS.filter((l) => l.room === selRoom).map((l) => l.entity) });
    if (d.roomBl !== undefined) store.call('cover', 'set_cover_position', { entity_id: BLINDS.filter((b) => b.room === selRoom).map((b) => b.entity), position: +d.roomBl });
    if (d.allBl !== undefined) store.call('cover', 'set_cover_position', { entity_id: BLINDS.map((b) => b.entity), position: +d.allBl });
    if (d.scene) store.call('scene', 'turn_on', { entity_id: d.scene });
    if (d.appSrc) store.call('media_player', 'play_media', { entity_id: TV.entity, media_content_type: 'app', media_content_id: d.appSrc });
    if (d.tvPower) store.call('media_player', tv().on ? 'turn_off' : 'turn_on', { entity_id: TV.entity });
    if (d.tvPlay) store.call('media_player', tv().on ? 'media_play_pause' : 'turn_on', { entity_id: TV.entity });
    if (d.tvVol) for (let i = 0; i < 3; i++) store.call('media_player', +d.tvVol > 0 ? 'volume_up' : 'volume_down', { entity_id: TV.entity }); // this TV only steps
    if (d.vac) { vacCmd = { cmd: d.vac, at: Date.now() }; store.call('vacuum', d.vac, { entity_id: VACUUM.entity }); }
    if (d.dw) store.call('script', 'turn_on', { entity_id: DISHWASHER.startNow });
    if (d.ib) store.call('input_boolean', 'toggle', { entity_id: d.ib });
    if (d.go) mode = d.go as Mode;
    if (d.dev) openDevice(d.dev, d.devTitle ?? '');
    if (d.back !== undefined) { mode = devBack; devView = null; house.focus(null); }
    if (d.dtoggle) store.call(d.dtoggle.split('.')[0], 'toggle', { entity_id: d.dtoggle });
    if (d.dpress && confirm(window.__t('Press “{name}”?', { name: d.dname ?? '' }))) {
      const dom = d.dpress.split('.')[0];
      store.call(dom, dom === 'script' ? 'turn_on' : 'press', { entity_id: d.dpress });
    }
    renderAll();
  });
  P.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement; setP(t);
    if (t.dataset.sl) { const L = LIGHTS.find((l) => l.id === t.dataset.sl)!; $('lv-' + L.id).textContent = t.value + '%'; lightTurnOn(L, { brightness_pct: +t.value }); }
    if (t.dataset.sb) $('bv-' + t.dataset.sb).textContent = bTxt(+t.value);
  });
  P.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.sl) lightTurnOn(LIGHTS.find((l) => l.id === t.dataset.sl)!, { brightness_pct: +t.value }, true);
    if (t.dataset.sb) setBlind(BLINDS.find((b) => b.id === t.dataset.sb)!, +t.value);
    if (t.dataset.dsel) { const dom = t.dataset.dsel.split('.')[0]; store.call(dom, 'select_option', { entity_id: t.dataset.dsel, option: t.value }); }
    if (t.dataset.dnum) { const dom = t.dataset.dnum.split('.')[0]; store.call(dom, 'set_value', { entity_id: t.dataset.dnum, value: +t.value }); }
  });
}

function setFloor(f: Floor) { floor = f; house.setFloor(f); closePop(); renderAll(); }

/* ---------------- personal themes ---------------- */
let theme = '';
function wantedTheme(): string {
  const q = new URLSearchParams(location.search).get('theme');
  try { if (q) q === 'default' ? localStorage.removeItem('sh.theme') : localStorage.setItem('sh.theme', q); } catch { /* storage blocked */ }
  let forced: string | null = null; try { forced = localStorage.getItem('sh.theme'); } catch { /* storage blocked */ }
  return forced ?? USER_THEMES[(store.user?.name ?? '').toLowerCase()] ?? 'default';
}
function applyTheme() {
  const t = wantedTheme(); if (t === theme) { if (t === 'kawaii') tick(); return; } // tick: greeting appears as soon as the user is known
  theme = t; document.documentElement.dataset.theme = t; house.setTheme(t);
  if (t === 'kawaii' && !document.getElementById('kawaii-fonts')) {
    const l = Object.assign(document.createElement('link'), { id: 'kawaii-fonts', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fredoka:wght@300..600&family=Quicksand:wght@400..700&display=swap' });
    document.head.appendChild(l);
  }
  tick();
}

/* ---------------- personal language ---------------- */
function applyLang() {
  const q = new URLSearchParams(location.search).get('lang');
  try { if (q) q === 'auto' ? localStorage.removeItem('sh.lang') : localStorage.setItem('sh.lang', q); } catch { /* storage blocked */ }
  let forced: string | null = null; try { forced = localStorage.getItem('sh.lang'); } catch { /* storage blocked */ }
  const want = forced ?? USER_LANGS[(store.user?.name ?? '').toLowerCase()] ?? 'en';
  if (want === getLang() && document.documentElement.lang) return;
  setLang(want); translateStatic(); for (const k of Object.keys(lastHtml)) lastHtml[k] = ''; tick();
}

function renderAll() {
  applyLang();
  applyTheme();
  if (selRoom && ROOMS[selRoom].floor !== floor) { floor = ROOMS[selRoom].floor; house.setFloor(floor); }
  // keep a column free for the Today card, except in the stacked phone layout where the card is hidden
  house.setReserveLeft(mode === 'lights' && window.innerWidth > 820 ? 330 : 0);
  syncHouse(); renderMenu(); renderPanel(); renderMarks(); renderChips(); renderToday(); renderSide();
  if (popId) syncPop();
}

/* ---------------- clock + temperature wave ---------------- */
function tick() {
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  const first = (store.user?.name ?? '').split(' ')[0];
  $('date').textContent = theme === 'kawaii' && first ? `${t('Hej {name} ♡', { name: first })} · ${date}` : date;
}
/* sidebar sparkline: outside (blue) and inside (orange) temperature over the last 24 hours. Connected, it draws the
   weather entity's real history and the indoor sensor's when there is one; demo mode draws sample curves. */
const SAMPLE_IN = [20.6, 20.4, 20.2, 20.1, 20.0, 20.2, 20.8, 21.4, 21.6, 21.5, 21.3, 21.2, 21.4, 21.6, 21.8, 21.9, 21.7, 21.5, 21.6, 21.8, 21.6, 21.4, 21.3, 21.3];
const SAMPLE_OUT = [8.1, 7.6, 7.2, 6.9, 6.8, 7.0, 7.8, 9.1, 10.4, 11.6, 12.3, 12.9, 13.4, 13.6, 13.4, 13.0, 12.6, 12.4, 11.8, 11.0, 10.2, 9.6, 9.1, 8.7];
async function wave() {
  let out: number[] | null = SAMPLE_OUT, inside: number[] | null = SAMPLE_IN;
  if (store.status.mode === 'live') {
    const now = Date.now(), hourly = (rows: { t: number; v: number }[] | null) => {
      if (!rows) return null; // last known value at the end of each of the past 24 hours
      const pts = Array.from({ length: 24 }, (_, i) => { const at = now - (23 - i) * 3600e3; let v = NaN; for (const r of rows) if (r.t <= at) v = r.v; return v; });
      const first = pts.find(Number.isFinite); return first == null ? null : pts.map((v) => Number.isFinite(v) ? v : first);
    };
    out = hourly(await store.history(CLIMATE.weather, 24, 'temperature'));
    inside = hourly(await store.history(CLIMATE.indoorTemp, 24));
  }
  const all = [...(out ?? []), ...(inside ?? [])];
  if (!all.length) { $('wave').innerHTML = ''; return; }
  const lo = Math.min(...all) - .5, hi = Math.max(...all) + .5;
  const path = (a: number[]) => {
    const pts = a.map((v, i) => [(i / (a.length - 1)) * 300, 6 + (1 - (v - lo) / (hi - lo)) * 46]); let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; } return d;
  };
  $('wave').innerHTML = `<defs><linearGradient id="wo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9f4a" stop-opacity=".35"/><stop offset="1" stop-color="#ff9f4a" stop-opacity="0"/></linearGradient>
    <linearGradient id="wb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4aa3ff" stop-opacity=".3"/><stop offset="1" stop-color="#4aa3ff" stop-opacity="0"/></linearGradient></defs>
    ${out ? `<path d="${path(out)} L300,58 L0,58Z" fill="url(#wb)"/><path d="${path(out)}" fill="none" stroke="#4aa3ff" stroke-width="1.6"/>` : ''}
    ${inside ? `<path d="${path(inside)} L300,58 L0,58Z" fill="url(#wo)"/><path d="${path(inside)}" fill="none" stroke="#ff9f4a" stroke-width="1.6"/>` : ''}`;
}

(window as any).__t = t;
(window as any).__sh = { store, render: () => renderAll(), get house() { return house; } }; // for diagnostics from the browser console
export async function startApp() {
  house = new HouseScene($('gl') as HTMLCanvasElement, $('stage'));
  house.onFirstFrame = () => { $('loading').hidden = true; };
  house.onResize = () => { lastHtml.marks = ''; lastHtml.outlines = ''; renderMarks(); renderToday(); };
  house.onCamera = () => { renderMarks(); };
  // deep links: ?view=energy (or rooms, scenes, appliances, blinds, media, devices), ?sun=day|night, ?room=kitchen
  const q = new URLSearchParams(location.search);
  if (MENU.some(([m]) => m === q.get('view'))) mode = q.get('view') as Mode;
  if (q.get('sun') === 'day' || q.get('sun') === 'night') sunMode = q.get('sun') as 'day' | 'night';
  if (q.get('room') && ROOMS[q.get('room')!]) { mode = 'rooms'; selRoom = q.get('room'); }
  bind(); tick(); wave();
  setInterval(() => { tick(); renderAll(); }, 20000);
  setInterval(() => wave(), 15 * 60e3);
  store.subscribe(renderAll);
  renderAll();
  await store.start();
  setTimeout(() => wave(), 3000); // once the first states have arrived
  if (q.has('vacmap')) showVacMap().catch((e) => console.warn('vacmap', e));
}
