export interface SummaryResponse {
  period: string;
  period_start: string | null;
  total_distance_m: number;
  total_moving_time_s: number;
  total_elevation_gain_m: number;
  activity_count: number;
  avg_pace_s_per_km: number | null;
  avg_heartrate: number | null;
}

export interface TrendPoint {
  period: string;
  value: number;
}

export interface TrendsResponse {
  metric: string;
  granularity: string;
  data: TrendPoint[];
}

export interface ActivityItem {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_speed: number;
  has_heartrate: boolean;
  average_heartrate: number | null;
  suffer_score: number | null;
  kudos_count: number;
}

export interface ActivitiesResponse {
  activities: ActivityItem[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface SyncStatusResponse {
  last_sync_completed_at: number | null;
  is_initial_backfill_done: boolean;
  activities_synced: number;
  total_activities_in_db: number;
  last_sync_activities_fetched: number;
  ttl_remaining_seconds: number;
}

export interface SyncTriggerResponse {
  status: string;
  message?: string;
  reason?: string;
  retry_after_seconds?: number;
}

export interface Split {
  split: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_difference: number;
  average_speed: number;
  average_heartrate: number | null;
  pace_zone: number | null;
}

export interface Lap {
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_speed: number;
  max_speed: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  total_elevation_gain: number;
}

export interface ActivityDetailResponse {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  has_heartrate: boolean;
  average_heartrate: number | null;
  max_heartrate: number | null;
  calories: number;
  description: string;
  gear_id: string | null;
  device_name: string | null;
  splits_km: Split[];
  splits_mi: Split[];
  laps: Lap[];
}

export interface HRZone {
  zone: string;
  min_hr: number;
  max_hr: number;
  time_seconds: number;
}

export interface ZonesResponse {
  has_zones: boolean;
  sensor_based?: boolean;
  total_time_seconds?: number;
  zones: HRZone[];
}

export type Period = "week" | "month" | "year" | "all";
export type Metric = "distance" | "duration" | "pace" | "elevation" | "count";
export type Granularity = "weekly" | "monthly";
