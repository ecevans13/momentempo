import type {
  SummaryResponse,
  TrendsResponse,
  ActivitiesResponse,
  ActivityDetailResponse,
  ZonesResponse,
  SyncStatusResponse,
  SyncTriggerResponse,
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

export function fetchGear(): Promise<{ gear: import("./types").GearItem[] }> {
  return fetchJSON("/api/gear");
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
