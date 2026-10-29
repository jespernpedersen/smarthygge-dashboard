export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed?: string;
}
export type Entities = Record<string, HassEntity>;
export interface HourValue { start: number; value: number }

export interface Backend {
  readonly kind: 'demo' | 'ha';
  start(onChange: (entities: Entities) => void): Promise<void>;
  call(domain: string, service: string, data: Record<string, any>): Promise<void>;
  /** hourly change of a cumulative statistic (e.g. kWh), newest last */
  hourlyStats(statisticId: string, hours: number): Promise<HourValue[] | null>;
}

/** A price point from Energi Data Service (`raw_today` / `raw_tomorrow`). */
export interface PricePoint { hour: string; price: number }
