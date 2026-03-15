import type {
  SummaryResponse,
  TrendsResponse,
  ActivitiesResponse,
  ActivityDetailResponse,
  ZonesResponse,
  StreamsResponse,
  SyncStatusResponse,
  SyncTriggerResponse,
  HeatmapResponse,
  HeatmapDayResponse,
  RacePredictionsResponse,
  WhatsWorkingResponse,
  FitnessResponse,
  WeeklyReportResponse,
  CoachResponse,
  HealthImportResponse,
  HealthSummaryResponse,
  LandingResponse,
  BestEffortsProgressionResponse,
  Period,
  Metric,
  Granularity,
} from "./types";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function fetchLandingData(): Promise<LandingResponse> {
  return fetchJSON("/api/landing/recent");
}

export function fetchSummary(period: Period): Promise<SummaryResponse> {
  return fetchJSON(`/api/dashboard/summary?period=${period}`);
}

export function fetchTrends(
  metric: Metric,
  granularity: Granularity,
  months: number = 12,
  sportType?: string,
): Promise<TrendsResponse> {
  const params = new URLSearchParams({
    metric,
    granularity,
    months: String(months),
  });
  if (sportType) params.set("sport_type", sportType);
  return fetchJSON(`/api/dashboard/trends?${params}`);
}

export function fetchActivities(
  page: number = 1,
  perPage: number = 20,
  sportType?: string,
): Promise<ActivitiesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (sportType) params.set("sport_type", sportType);
  return fetchJSON(`/api/activities?${params}`);
}

export function fetchSyncStatus(): Promise<SyncStatusResponse> {
  return fetchJSON("/api/sync/status");
}

export function triggerSync(): Promise<SyncTriggerResponse> {
  return fetchJSON("/api/sync", { method: "POST" });
}

export function fetchActivityDetail(id: number): Promise<ActivityDetailResponse> {
  return fetchJSON(`/api/activity/${id}`);
}

export function fetchActivityZones(id: number): Promise<ZonesResponse> {
  return fetchJSON(`/api/activity/${id}/zones`);
}

export function fetchActivityStreams(id: number): Promise<StreamsResponse> {
  return fetchJSON(`/api/activity/${id}/streams`);
}

export function fetchGear(): Promise<{ gear: import("./types").GearItem[] }> {
  return fetchJSON("/api/gear");
}

export function fetchGearActivities(gearId: string): Promise<{ activities: import("./types").ActivityItem[]; total: number }> {
  return fetchJSON(`/api/gear/${gearId}/activities`);
}

export function fetchPRs(): Promise<{ prs: import("./types").PRItem[] }> {
  return fetchJSON("/api/trophies/prs");
}

export function fetchMilestones(): Promise<{ milestones: import("./types").MilestoneItem[] }> {
  return fetchJSON("/api/trophies/milestones");
}

export function createMilestone(data: { title: string; description?: string; achieved_at?: string | null }): Promise<import("./types").MilestoneItem> {
  return fetchJSON("/api/trophies/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteMilestone(id: number): Promise<void> {
  return fetch(`/api/trophies/milestones/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
  });
}

export function fetchTimeline(): Promise<{ events: import("./types").TimelineEvent[] }> {
  return fetchJSON("/api/trophies/timeline");
}

export function fetchBestEffortsProgression(): Promise<BestEffortsProgressionResponse> {
  return fetchJSON("/api/trophies/best-efforts-progression");
}

export function fetchHeatmap(months: number = 12): Promise<HeatmapResponse> {
  return fetchJSON(`/api/insights/heatmap?months=${months}`);
}

export function fetchHeatmapDay(date: string): Promise<HeatmapDayResponse> {
  return fetchJSON(`/api/insights/heatmap/day?date=${date}`);
}

export function fetchRacePredictions(): Promise<RacePredictionsResponse> {
  return fetchJSON("/api/insights/race-predictions");
}

export function fetchWhatsWorking(): Promise<WhatsWorkingResponse> {
  return fetchJSON("/api/insights/whats-working");
}

export function fetchFitness(months: number = 6, lthr?: number): Promise<FitnessResponse> {
  const params = new URLSearchParams({ months: String(months) });
  if (lthr) params.set("lthr", String(lthr));
  return fetchJSON(`/api/insights/fitness?${params}`);
}

export function fetchWeeklyReport(): Promise<WeeklyReportResponse> {
  return fetchJSON("/api/insights/weekly-report");
}

export function fetchCoachAdvice(): Promise<CoachResponse> {
  return fetchJSON("/api/coach/advice");
}

export async function uploadHealthExport(file: File): Promise<HealthImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/health/import", { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export function fetchHealthSummary(): Promise<HealthSummaryResponse> {
  return fetchJSON("/api/health/summary");
}

export function fetchHealthHistory(): Promise<import("./types").HealthHistoryResponse> {
  return fetchJSON("/api/health/history");
}
