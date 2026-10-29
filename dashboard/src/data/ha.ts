/**
 * Home Assistant backend over the WebSocket API.
 *
 * Where the dashboard finds Home Assistant, in order:
 *  1. served from HA itself (/local/smarthygge/…)  → same origin, reuses HA's own login
 *  2. ?ha=http://homeassistant.local:8123 in the URL  → remembered in localStorage
 *  3. nothing                                          → the app stays in demo mode
 * A long-lived token (?token=…) can be given once for kiosk tablets.
 */
import {
  getAuth, createConnection, subscribeEntities, callService, createLongLivedTokenAuth, getUser, getConfig,
  type Auth, type AuthData, type Connection,
} from 'home-assistant-js-websocket';
import type { Backend, Entities, HourValue } from './types';

const LS = { url: 'sh.hassUrl', tokens: 'sh.tokens', llat: 'sh.llat' };
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export function resolveHassUrl(): string | null {
  const q = new URLSearchParams(location.search);
  if (q.get('ha')) { write(LS.url, q.get('ha')!.replace(/\/$/, '')); }
  if (q.get('token')) { write(LS.llat, q.get('token')); }
  if (q.get('ha') || q.get('token')) { q.delete('ha'); q.delete('token'); history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash); }
  if (location.pathname.includes('/local/') || location.pathname.includes('/hacsfiles/')) return location.origin;
  return read(LS.url);
}

export function forgetHass() { write(LS.url, null); write(LS.tokens, null); write(LS.llat, null); }

export class HABackend implements Backend {
  readonly kind = 'ha' as const;
  conn!: Connection;
  user: { id: string; name: string; is_admin: boolean } | null = null;
  /** the home's location from Home Assistant's settings (used for the sun's position) */
  location: { latitude: number; longitude: number } | null = null;
  constructor(readonly hassUrl: string) {}

  private async auth(): Promise<Auth> {
    const llat = read(LS.llat);
    if (llat) return createLongLivedTokenAuth(this.hassUrl, llat);
    return getAuth({
      hassUrl: this.hassUrl,
      saveTokens: (t) => write(LS.tokens, t ? JSON.stringify(t) : null),
      loadTokens: async () => {
        const own = read(LS.tokens);
        if (own) return JSON.parse(own) as AuthData;
        // Same origin as HA (served from /local/ or inside an HA "Webpage" dashboard): reuse HA's own session.
        const ha = read('hassTokens');
        if (ha && location.origin === this.hassUrl) return JSON.parse(ha) as AuthData;
        return null;
      },
    });
  }

  async start(onChange: (e: Entities) => void) {
    const auth = await this.auth();
    if (location.search.includes('auth_callback')) history.replaceState(null, '', location.pathname);
    this.conn = await createConnection({ auth });
    try { this.user = (await getUser(this.conn)) as any; } catch { this.user = null; }
    try { const c = await getConfig(this.conn); this.location = { latitude: c.latitude, longitude: c.longitude }; } catch { this.location = null; }
    subscribeEntities(this.conn, (ents) => onChange(ents as unknown as Entities));
  }

  async call(domain: string, service: string, data: Record<string, any>) {
    const { entity_id, ...rest } = data;
    await callService(this.conn, domain, service, rest, entity_id ? { entity_id } : undefined);
  }

  /** every enabled, visible entity on the same device as `entityId`, with its category (null, 'config' or 'diagnostic') */
  async deviceEntities(entityId: string): Promise<{ id: string; category: string | null }[] | null> {
    try {
      const r: { entity_categories: Record<string, string>; entities: { ei: string; di?: string; ec?: number; hb?: boolean }[] } =
        await this.conn.sendMessagePromise({ type: 'config/entity_registry/list_for_display' });
      const dev = r.entities.find((e) => e.ei === entityId)?.di;
      if (!dev) return null;
      return r.entities.filter((e) => e.di === dev && !e.hb).map((e) => ({ id: e.ei, category: e.ec != null ? r.entity_categories[e.ec] ?? null : null }));
    } catch { return null; }
  }
  /** an entity's state (or one attribute) over the last hours, from the recorder */
  async history(entityId: string, hours: number, attr?: string): Promise<{ t: number; v: number }[] | null> {
    try {
      const res: Record<string, { s: string; a?: Record<string, unknown>; lu: number }[]> = await this.conn.sendMessagePromise({
        type: 'history/history_during_period', start_time: new Date(Date.now() - hours * 3600e3).toISOString(),
        entity_ids: [entityId], minimal_response: !attr, no_attributes: !attr, significant_changes_only: false,
      });
      const rows = (res[entityId] ?? []).map((r) => ({ t: r.lu * 1000, v: Number(attr ? r.a?.[attr] : r.s) })).filter((r) => Number.isFinite(r.v));
      return rows.length ? rows : null;
    } catch { return null; }
  }
  async hourlyStats(statisticId: string, hours: number): Promise<HourValue[] | null> {
    const end = new Date(); end.setMinutes(0, 0, 0); end.setHours(end.getHours() + 1);
    const start = new Date(end.getTime() - hours * 3600e3);
    try {
      const res: Record<string, { start: number | string; change?: number }[]> = await this.conn.sendMessagePromise({
        type: 'recorder/statistics_during_period', start_time: start.toISOString(), end_time: end.toISOString(),
        statistic_ids: [statisticId], period: 'hour', types: ['change'],
      });
      const rows = res[statisticId];
      if (!rows?.length) return null;
      return rows.map((r) => ({ start: typeof r.start === 'number' ? r.start : Date.parse(r.start), value: r.change ?? 0 }));
    } catch { return null; }
  }
}
