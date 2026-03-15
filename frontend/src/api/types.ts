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

export interface GearItem {
  id: string;
  name: string;
  nickname: string;
  brand_name: string;
  model_name: string;
  distance: number;
  activity_count: number;
  retired: boolean;
}

export interface PRItem {
  distance_name: string;
  distance_target_m: number;
  activity_id: number | null;
  activity_name: string | null;
  moving_time: number | null;
  distance: number | null;
  start_date: string | null;
  average_heartrate: number | null;
}

export interface MilestoneItem {
  id: number;
  title: string;
  description: string;
  achieved_at: string | null;
  created_at: number;
}

export interface TimelineEvent {
  type: "pr" | "milestone";
  title: string;
  subtitle: string;
  date: string;
  moving_time?: number;
  activity_id?: number;
  milestone_id?: number;
}

// Landing page types

export interface LandingActivity extends ActivityItem {
  summary_polyline: string | null;
}

export interface LifetimeStats {
  total_activities: number;
  total_distance_m: number;
  total_moving_time_s: number;
  total_elevation_gain_m: number;
  total_runs: number;
  total_kudos: number;
  total_prs: number;
  distinct_sport_types: number;
  fastest_5k_s: number | null;
}

export interface LandingResponse {
  lifetime_stats: LifetimeStats;
  recent_activities: LandingActivity[];
}

export type Period = "week" | "month" | "year" | "all";
export type Metric = "distance" | "duration" | "pace" | "elevation" | "count";
export type Granularity = "weekly" | "monthly";

// Insights types

export interface HeatmapDay {
  date: string;
  load: number;
}

export interface HeatmapResponse {
  months: number;
  days: HeatmapDay[];
  max_load: number;
}

export interface HeatmapDayActivity {
  id: number;
  name: string;
  sport_type: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_heartrate: number | null;
  has_heartrate: boolean;
}

export interface HeatmapDayResponse {
  date: string;
  activities: HeatmapDayActivity[];
}

export interface AnchorEffort {
  distance_name: string;
  distance_m: number;
  time_seconds: number;
  activity_id: number;
  activity_name: string;
  start_date: string;
}

export interface RacePrediction {
  distance_name: string;
  distance_m: number;
  predicted_seconds: number;
  confidence: "high" | "medium" | "low";
  based_on: string;
}

export interface RacePredictionsResponse {
  anchor_efforts: AnchorEffort[];
  predictions: RacePrediction[];
  vdot_estimate: number | null;
}

export interface TrainingInsight {
  type: string;
  title: string;
  description: string;
  correlation: number;
  data_points: number;
}

export interface WhatsWorkingResponse {
  insights: TrainingInsight[];
  weeks_analyzed: number;
  insufficient_data: boolean;
}

// Fitness & Freshness types

export interface FitnessDataPoint {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface FitnessResponse {
  lthr_used: number | null;
  lthr_source: string | null;
  data: FitnessDataPoint[];
}

// Weekly Report types

export interface WeeklyReportStats {
  total_distance: number;
  total_duration: number;
  run_count: number;
  activity_count: number;
  longest_run: number;
  avg_pace: number | null;
}

export interface WeeklyReportResponse {
  summary_text: string;
  stats: WeeklyReportStats;
  vs_last_week: Record<string, number>;
  zone_distribution: Record<string, number>;
  has_data: boolean;
}

// Coach types

export interface CoachResponse {
  advice: string;
  generated_at: number;
  weeks_analyzed: number;
}

// Health Import types

export interface HealthImportResponse {
  status: string;
  records_imported: number;
  metric_types_found: string[];
}

export interface HealthMetricSummary {
  metric_type: string;
  latest_value: number;
  unit: string;
  latest_date: string;
  trend_pct: number | null;
}

export interface HealthSummaryResponse {
  metrics: HealthMetricSummary[];
  has_data: boolean;
}

export interface HealthHistoryPoint {
  date: string;
  value: number;
}

export interface HealthHistoryResponse {
  history: Record<string, HealthHistoryPoint[]>;
}

export interface EffortPoint {
  date: string;
  moving_time: number;
  activity_id: number;
  activity_name: string;
}

export interface BestEffortsProgressionResponse {
  progression: Record<string, EffortPoint[]>;
}

export interface StreamsResponse {
  activity_id: number;
  has_gps: boolean;
  has_altitude: boolean;
  has_heartrate: boolean;
  latlng: [number, number][] | null;
  altitude: number[] | null;
  heartrate: number[] | null;
  velocity_smooth: number[] | null;
  time: number[] | null;
  distance: number[] | null;
}

// Activity detail extension
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
  summary_polyline: string | null;
  splits_km: Split[];
  splits_mi: Split[];
  laps: Lap[];
}
