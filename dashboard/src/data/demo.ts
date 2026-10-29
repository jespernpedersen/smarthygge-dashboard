/**
 * Demo backend: simulates every entity the dashboard uses, with the same shapes
 * Home Assistant returns, so the UI code never has to know the difference.
 */
import type { Backend, Entities, HassEntity, HourValue, PricePoint } from './types';
import { LIGHTS, BLINDS, TV, PEOPLE, VACUUM, DISHWASHER, VACUUM_HELPERS, CLIMATE, ENERGY, SCENES, ROOMS } from '../config/home';
import { plannedDishwasherStart } from './logic';

const START: Record<string, [on: boolean, b: number, k: number]> = {
  'light.living_room_floor_lamp': [true, 55, 2400],
  'light.dining_pendant': [true, 70, 2400],
  'light.kitchen_ceiling': [true, 85, 2700],
  'light.kitchen_counter': [true, 100, 3000],
  'light.bedside_lamp_left': [true, 40, 2200],
  'light.bedside_lamp_right': [false, 40, 2200],
  'light.office_desk_lamp': [true, 90, 3000],
};
const BLIND_START: Record<string, number> = {};

/** Plausible Danish spot price + tariffs (kr/kWh) for a weekday in October. */
function demoPrices(day: Date): PricePoint[] {
  const base = [1.21, 1.14, 1.09, 1.05, 1.07, 1.18, 1.62, 2.31, 2.48, 2.12, 1.86, 1.71, 1.64, 1.6, 1.66, 1.82, 2.24, 3.41, 3.78, 3.52, 2.61, 1.98, 1.62, 1.38];
  const seed = day.getDate();
  return base.map((p, h) => {
    const d = new Date(day); d.setHours(h, 0, 0, 0);
    return { hour: d.toISOString(), price: +(p + Math.sin((h + seed) * 1.7) * 0.08).toFixed(2) };
  });
}

export class DemoBackend implements Backend {
  readonly kind = 'demo' as const;
  private e: Entities = {};
  private emit: (e: Entities) => void = () => {};
  private energyTotal = 4120.5;
  private vacuumTimer = 0;
  private dwLeft = 0;

  private set(id: string, state: string, attributes: Record<string, any> = {}) {
    const prev = this.e[id];
    this.e[id] = { entity_id: id, state, attributes: { ...(prev?.attributes ?? {}), ...attributes }, last_changed: prev?.state === state ? prev.last_changed : new Date().toISOString() };
  }

  async start(onChange: (e: Entities) => void) {
    this.emit = onChange;
    for (const l of LIGHTS) {
      const [on, b, k] = START[l.entity] ?? [false, 70, 2700];
      this.set(l.entity, on ? 'on' : 'off', { friendly_name: l.name, brightness: Math.round((b / 100) * 255), color_temp_kelvin: k, supported_color_modes: ['color_temp'] });
    }
    for (const b of BLINDS) { const p = BLIND_START[b.entity] ?? 100; this.set(b.entity, p > 0 ? 'open' : 'closed', { current_position: p, friendly_name: b.name }); }
    this.set(TV.entity, 'off', { volume_level: 0.22, source: 'Netflix', app_name: 'Netflix', friendly_name: TV.name, source_list: TV.apps.map((a) => a.name) });
    for (const p of PEOPLE) this.set(p.entity, 'home', { friendly_name: p.name });
    this.set(CLIMATE.indoorTemp, '21.3', { unit_of_measurement: '°C' });
    this.set(CLIMATE.humidity, '48', { unit_of_measurement: '%' });
    this.set('sensor.bedroom_temperature', '19.8', { unit_of_measurement: '°C' });
    this.set(CLIMATE.weather, 'cloudy', { temperature: 12.4, humidity: 81 });
    this.set(VACUUM.entity, 'docked', { friendly_name: VACUUM.name, fan_speed: 'Standard' });
    this.set(VACUUM.battery, '100', { unit_of_measurement: '%' });
    this.set(VACUUM_HELPERS.autoClean, 'on');
    const y = new Date(Date.now() - 26 * 3600e3);
    this.set(VACUUM_HELPERS.lastClean, y.toISOString(), { timestamp: y.getTime() / 1000 });
    this.set(DISHWASHER.status, 'ready', { friendly_name: DISHWASHER.name });
    this.set(DISHWASHER.finishTime, 'unavailable');
    this.set(DISHWASHER.progress, '0', { unit_of_measurement: '%' });
    this.set(DISHWASHER.door, 'closed');
    this.set(DISHWASHER.remoteStart, 'on');
    this.set(DISHWASHER.loaded, 'off');
    this.set(DISHWASHER.startNow, 'off');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 864e5);
    this.set(ENERGY.price, '0', { unit_of_measurement: 'kr/kWh', raw_today: demoPrices(today), raw_tomorrow: demoPrices(tomorrow) });
    for (const s of SCENES) this.set(s.entity, 'scening', { friendly_name: s.name });
    this.tickSlow();
    setInterval(() => this.tickFast(), 1000);
    setInterval(() => this.tickSlow(), 15000);
    this.emit({ ...this.e });
  }

  /** one demo second = one appliance minute, so cycles are watchable */
  private tickFast() {
    let changed = false;
    const dw = this.e[DISHWASHER.status];
    if (dw?.state === 'run') {
      this.dwLeft = Math.max(0, this.dwLeft - 1); // one demo second = one minute
      this.set(DISHWASHER.finishTime, new Date(Date.now() + this.dwLeft * 60e3).toISOString());
      this.set(DISHWASHER.progress, String(Math.round((1 - this.dwLeft / 128) * 100)));
      if (this.dwLeft === 0) { this.set(DISHWASHER.status, 'finished'); this.set(DISHWASHER.loaded, 'off'); }
      changed = true;
    }
    const v = this.e[VACUUM.entity];
    if (v.state === 'cleaning' || v.state === 'returning') {
      this.vacuumTimer++;
      const bat = Math.max(20, +this.e[VACUUM.battery].state - 0.6);
      this.set(VACUUM.battery, bat.toFixed(0));
      if (v.state === 'cleaning' && this.vacuumTimer > 75) { this.set(VACUUM.entity, 'returning'); }
      if (v.state === 'returning' && this.vacuumTimer > 85) {
        this.set(VACUUM.entity, 'docked');
        const now = new Date(); this.set(VACUUM_HELPERS.lastClean, now.toISOString(), { timestamp: now.getTime() / 1000 });
      }
      this.set(VACUUM.entity, this.e[VACUUM.entity].state, { progress: Math.min(1, this.vacuumTimer / 75) });
      changed = true;
    } else if (v.state === 'docked' && +this.e[VACUUM.battery].state < 100) {
      this.set(VACUUM.battery, String(Math.min(100, +this.e[VACUUM.battery].state + 1))); changed = true;
    }
    if (changed) this.emit({ ...this.e });
  }

  private tickSlow() {
    const lightsW = LIGHTS.reduce((w, l) => { const s = this.e[l.entity]; return w + (s?.state === 'on' ? 9 * (s.attributes.brightness / 255) : 0); }, 0);
    const extra = (this.e[TV.entity]?.state === 'on' ? 85 : 0) + (this.e[DISHWASHER.status]?.state === 'run' ? 1850 : 0) + (this.e[VACUUM.entity]?.state === 'cleaning' ? 45 : 0);
    const w = 185 + lightsW + extra + Math.random() * 40;
    this.energyTotal += (w / 1000) * (15 / 3600);
    this.set(ENERGY.power, w.toFixed(0), { unit_of_measurement: 'W' });
    this.set(ENERGY.energy, this.energyTotal.toFixed(2), { unit_of_measurement: 'kWh' });
    const prices: PricePoint[] = this.e[ENERGY.price].attributes.raw_today;
    this.set(ENERGY.price, prices[new Date().getHours()].price.toFixed(2));
    const planned = this.e[DISHWASHER.loaded].state === 'on' && this.e[DISHWASHER.status].state !== 'run'
      ? plannedDishwasherStart([...prices, ...this.e[ENERGY.price].attributes.raw_tomorrow]) : null;
    this.set(DISHWASHER.plannedStart, planned ? planned.start.toISOString() : 'unknown', planned ? { price: planned.avg } : { price: null });
    this.emit({ ...this.e });
  }

  async call(domain: string, service: string, data: Record<string, any>) {
    const ids: string[] = [].concat(data.entity_id ?? []);
    for (const id of ids) this.apply(domain, service, id, data);
    this.tickSlow();
  }

  private apply(domain: string, service: string, id: string, data: Record<string, any>) {
    const cur = this.e[id];
    if (domain === 'light') {
      const on = service === 'turn_on' || (service === 'toggle' && cur?.state !== 'on');
      const attrs: Record<string, any> = {};
      if (data.brightness_pct != null) attrs.brightness = Math.round((data.brightness_pct / 100) * 255);
      if (data.color_temp_kelvin != null) attrs.color_temp_kelvin = data.color_temp_kelvin;
      this.set(id, on ? 'on' : 'off', attrs);
    }
    if (domain === 'cover') {
      const p = service === 'open_cover' ? 100 : service === 'close_cover' ? 0 : data.position;
      this.set(id, p > 0 ? 'open' : 'closed', { current_position: p });
    }
    if (domain === 'media_player') {
      if (service === 'turn_on') this.set(id, 'playing');
      if (service === 'turn_off') this.set(id, 'off');
      if (service === 'volume_set') this.set(id, cur.state, { volume_level: data.volume_level });
      if (service === 'volume_up' || service === 'volume_down') this.set(id, cur.state, { volume_level: Math.max(0, Math.min(1, (cur.attributes.volume_level ?? .2) + (service === 'volume_up' ? .01 : -.01))) });
      if (service === 'play_media') this.set(id, 'playing', { app_id: data.media_content_id, app_name: data.media_content_id });
      if (service === 'select_source') this.set(id, 'playing', { source: data.source, app_name: data.source });
      if (service === 'media_play_pause') this.set(id, cur.state === 'playing' ? 'paused' : 'playing');
    }
    if (domain === 'vacuum') {
      if (service === 'start') { this.vacuumTimer = 0; this.set(id, 'cleaning', { progress: 0 }); }
      if (service === 'pause') this.set(id, 'paused');
      if (service === 'return_to_base') { this.vacuumTimer = 76; this.set(id, 'returning'); }
    }
    if (domain === 'script' && id === DISHWASHER.startNow) { this.dwLeft = 128; this.set(DISHWASHER.status, 'run'); this.set(DISHWASHER.loaded, 'off'); }
    if (domain === 'input_boolean') {
      const on = service === 'turn_on' || (service === 'toggle' && cur?.state !== 'on');
      this.set(id, on ? 'on' : 'off');
      if (id === DISHWASHER.loaded && on && this.e[DISHWASHER.status].state === 'finished') this.set(DISHWASHER.status, 'idle');
    }
    if (domain === 'scene') {
      const sc = SCENES.find((s) => s.entity === id);
      if (!sc) return;
      for (const [target, st] of Object.entries(sc.demo)) {
        const targets = target === '*light' ? LIGHTS.map((l) => l.entity) : [target];
        for (const t of targets) {
          const d = t.split('.')[0], s = st as any;
          if (d === 'light') this.apply('light', s.state === 'on' ? 'turn_on' : 'turn_off', t, { brightness_pct: s.b, color_temp_kelvin: s.k });
          if (d === 'cover') this.apply('cover', 'set_cover_position', t, { position: s.p });
          if (d === 'media_player') this.apply('media_player', s.state === 'on' ? 'turn_on' : 'turn_off', t, {});
        }
      }
    }
  }

  async hourlyStats(statisticId: string, hours: number): Promise<HourValue[]> {
    const out: HourValue[] = [];
    const now = new Date(); now.setMinutes(0, 0, 0);
    const shape = [.28, .24, .22, .21, .22, .26, .45, .72, .58, .36, .31, .34, .38, .33, .3, .36, .52, .86, 1.12, .94, .71, .58, .46, .34];
    for (let i = hours - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 3600e3);
      const h = t.getHours();
      out.push({ start: t.getTime(), value: +(shape[h] * (0.9 + ((h * 7 + t.getDate()) % 5) * 0.05)).toFixed(2) });
    }
    return out;
  }
}

/** room temperature fallbacks so every room shows something sensible in demo */
export const DEMO_ROOM_TEMPS: Record<string, number> = Object.fromEntries(Object.keys(ROOMS).map((k, i) => [k, [21.3, 21.6, 19.4, 19.8, 20.6, 22.8, 20.1][i] ?? 21]));
