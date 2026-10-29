import type { PricePoint } from './types';

/**
 * Cheapest start for a dishwasher run, finishing before `doneBy` o'clock (next occurrence).
 * Mirrors the `sensor.dishwasher_planned_start` template in homeassistant/packages/smarthygge.yaml,
 * so demo mode and the real house agree.
 */
export function plannedDishwasherStart(prices: PricePoint[], runHours = 4, doneBy = 7, now = new Date()): { start: Date; avg: number } | null {
  const first = new Date(now); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
  const deadline = new Date(now); deadline.setHours(doneBy, 0, 0, 0);
  if (deadline <= now) deadline.setDate(deadline.getDate() + 1);
  const byHour = new Map(prices.map((p) => [new Date(p.hour).getTime(), p.price]));
  let best: { start: Date; avg: number } | null = null;
  for (let t = first.getTime(); t + runHours * 3600e3 <= deadline.getTime(); t += 3600e3) {
    let sum = 0, ok = true;
    for (let h = 0; h < runHours; h++) { const p = byHour.get(t + h * 3600e3); if (p == null) { ok = false; break; } sum += p; }
    if (!ok) continue;
    const avg = sum / runHours;
    if (!best || avg < best.avg) best = { start: new Date(t), avg };
  }
  return best;
}

export const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtKr = (v: number) => v.toFixed(2) + ' kr';

/** The sun's position for a time and place: azimuth in degrees clockwise from north, elevation in degrees above the
 *  horizon. Low-precision solar formulas (good to well under a degree), plenty for lighting a floorplan. */
export function sunPosition(date: Date, lat: number, lon: number): { az: number; el: number } {
  const rad = Math.PI / 180, d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = 18.697374558 + 24.06570982441908 * d, H = ((gmst * 15 + lon) * rad) - ra, phi = lat * rad;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { az: ((az / rad) % 360 + 360) % 360, el: el / rad };
}
