/**
 * One place for entity state. Demo entities always exist; real Home Assistant
 * entities replace them one by one as integrations get set up, so the house can
 * be wired up gradually without the dashboard ever looking broken.
 */
import { DemoBackend } from './demo';
import { HABackend, resolveHassUrl } from './ha';
import type { Entities, HassEntity, HourValue } from './types';

export type ConnStatus = { mode: 'demo' } | { mode: 'connecting'; url: string } | { mode: 'live'; url: string; live: number } | { mode: 'error'; url: string; message: string };

class Store {
  private demo = new DemoBackend();
  private ha: HABackend | null = null;
  private real: Entities = {};
  private fake: Entities = {};
  private listeners = new Set<() => void>();
  private queued = false;
  status: ConnStatus = { mode: 'demo' };
  /** the Home Assistant user signed in on this screen (null in demo mode) */
  get user() { return this.ha?.user ?? null; }
  /** the home's location from Home Assistant, or roughly central Denmark in demo mode */
  get location() { return this.ha?.location ?? { latitude: 55.68, longitude: 12.57 }; }

  async start() {
    await this.demo.start((e) => { this.fake = e; this.changed(); });
    const url = resolveHassUrl();
    if (!url) return;
    this.status = { mode: 'connecting', url }; this.changed();
    try {
      this.ha = new HABackend(url);
      await this.ha.start((e) => { this.real = e; this.status = { mode: 'live', url, live: Object.keys(e).length }; this.changed(); });
    } catch (err: any) {
      this.ha = null;
      this.status = { mode: 'error', url, message: typeof err === 'number' ? `connection error ${err}` : String(err?.message ?? err) };
      this.changed();
    }
  }

  /** batches bursts of updates into one render per frame */
  private changed() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.listeners.forEach((f) => f()); });
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get(id: string): HassEntity | undefined { return this.real[id] ?? this.fake[id]; }
  isLive(id: string) { return !!this.real[id]; }
  /** entities of one domain (e.g. 'person'): the real ones once connected, otherwise the demo ones */
  domain(domain: string): HassEntity[] {
    const pick = (e: Record<string, HassEntity>) => Object.values(e).filter((x) => x.entity_id.startsWith(domain + '.'));
    const live = pick(this.real);
    return live.length ? live : pick(this.fake);
  }
  /** absolute URL for HA-relative paths like a person's entity_picture */
  url(path: string) { return /^https?:/.test(path) ? path : (this.status.mode !== 'demo' ? (this.status as any).url : '') + path; }
  num(id: string, fallback = NaN) { const v = parseFloat(this.get(id)?.state ?? ''); return Number.isFinite(v) ? v : fallback; }

  call(domain: string, service: string, data: Record<string, any> = {}) {
    const ids: string[] = [].concat(data.entity_id ?? []);
    const live = ids.filter((i) => this.isLive(i)), sim = ids.filter((i) => !this.isLive(i));
    if (live.length && this.ha) this.ha.call(domain, service, { ...data, entity_id: live }).catch((e) => console.warn('HA call failed', domain, service, e));
    if (sim.length || !ids.length) this.demo.call(domain, service, { ...data, entity_id: sim });
  }

  /** all entities on the same Home Assistant device (null in demo mode) */
  async deviceEntities(id: string) { return this.ha && this.isLive(id) ? this.ha.deviceEntities(id) : null; }
  /** recorder history for a real entity; null in demo mode or when there is none */
  async history(id: string, hours: number, attr?: string) { return this.ha && this.isLive(id) ? this.ha.history(id, hours, attr) : null; }
  async hourlyStats(id: string, hours: number): Promise<{ data: HourValue[]; live: boolean }> {
    if (this.ha && this.isLive(id)) { const d = await this.ha.hourlyStats(id, hours); if (d) return { data: d, live: true }; }
    return { data: (await this.demo.hourlyStats(id, hours))!, live: false };
  }
}

export const store = new Store();
