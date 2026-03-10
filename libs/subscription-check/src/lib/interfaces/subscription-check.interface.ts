export interface FeatureCheckResponse {
  allowed: boolean;
  plan: string;
  reason?: string;
}

export type LimitType = 'maxStaff' | 'maxLocations' | 'max_stations';
