/** Small SVG charts for the Energy view. Colours come from CSS tokens so they follow the theme. */
import type { HourValue, PricePoint } from '../data/types';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** price bars for one day: cheap / normal / expensive by tercile, current hour outlined, planned hours marked */
export function priceChart(prices: PricePoint[], planned: Set<number>): string {
  if (!prices.length) return '';
  const W = 400, H = 120, pad = 18, bw = (W - pad) / prices.length;
  const vals = prices.map((p) => p.price), max = Math.max(...vals) * 1.08;
  const sorted = [...vals].sort((a, b) => a - b), lo = sorted[Math.floor(vals.length / 3)], hi = sorted[Math.floor((vals.length * 2) / 3)];
  const nowH = new Date().getHours();
  let s = `<svg viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Electricity price per hour today">`;
  for (const t of [1, 2, 3]) { if (t > max) break; const y = H - (t / max) * H; s += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="2 4"/><text x="0" y="${y + 3}" font-size="9" fill="var(--dim)">${t}</text>`; }
  prices.forEach((p, i) => {
    // works for hourly and 15-minute prices: labels and markers only on the full hour
    const t = new Date(p.hour), h = (p.price / max) * H, x = pad + i * bw + Math.min(1.5, bw * .15), y = H - h, hour = t.getHours(), whole = t.getMinutes() === 0;
    const fill = p.price <= lo ? 'var(--cheap)' : p.price >= hi ? 'var(--dear)' : 'var(--mid)';
    s += `<rect x="${x}" y="${y}" width="${Math.max(1, bw - 3)}" height="${h}" rx="${bw > 6 ? 2.5 : 1}" fill="${fill}" opacity="${hour < nowH ? .35 : .9}"><title>${String(hour).padStart(2, '0')}:00 · ${p.price.toFixed(2)} kr/kWh</title></rect>`;
    if (hour === nowH && whole) s += `<rect x="${x - 1.5}" y="${y - 1.5}" width="${bw}" height="${h + 3}" rx="3.5" fill="none" stroke="var(--fg)" stroke-width="1.5"/>`;
    if (planned.has(hour) && whole) s += `<circle cx="${x + (bw - 3) / 2}" cy="${y - 7}" r="2.6" fill="var(--cool)"/>`;
    if (hour % 6 === 0 && whole) s += `<text x="${x + (bw - 3) / 2}" y="${H + 13}" font-size="9" text-anchor="middle" fill="var(--dim)">${String(hour).padStart(2, '0')}</text>`;
  });
  return s + '</svg>';
}

/** hourly kWh bars, newest on the right */
export function usageChart(rows: HourValue[]): string {
  if (!rows.length) return '';
  const W = 400, H = 90, bw = W / rows.length, max = Math.max(...rows.map((r) => r.value), .1) * 1.1;
  let s = `<svg viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Electricity use per hour, last 24 hours">`;
  rows.forEach((r, i) => {
    const h = Math.max(1, (r.value / max) * H), x = i * bw + 1.5, hour = new Date(r.start).getHours();
    s += `<rect x="${x}" y="${H - h}" width="${bw - 3}" height="${h}" rx="2.5" fill="var(--cool)" opacity="${i === rows.length - 1 ? 1 : .55}"><title>${String(hour).padStart(2, '0')}:00 · ${r.value.toFixed(2)} kWh</title></rect>`;
    if (hour % 6 === 0) s += `<text x="${x + (bw - 3) / 2}" y="${H + 13}" font-size="9" text-anchor="middle" fill="var(--dim)">${String(hour).padStart(2, '0')}</text>`;
  });
  return s + '</svg>';
}

/** circular progress ring used around appliance icons */
export function ring(frac: number, size = 46, stroke = 3, color = 'var(--cool)'): string {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c * Math.max(0, Math.min(1, frac))} ${c}"/></svg>`;
}

export { esc };
