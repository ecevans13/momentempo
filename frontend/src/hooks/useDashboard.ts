import { useState, useEffect, useCallback } from "react";
import {
  fetchSummary,
  fetchTrends,
  fetchActivities,
} from "../api/client";
import type {
  SummaryResponse,
  TrendsResponse,
  ActivitiesResponse,
  ActivityItem,
  Period,
  Metric,
  Granularity,
} from "../api/types";

export function useSummary(period: Period) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchSummary(period)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  return { data, loading, error };
}

export function useTrends(metric: Metric, granularity: Granularity, months: number = 12) {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchTrends(metric, granularity, months)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [metric, granularity, months]);

  return { data, loading, error };
}

export function useActivities(perPage: number = 20) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<Pick<ActivitiesResponse, "total" | "total_pages"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchActivities(1, perPage)
      .then((res) => {
        setActivities(res.activities);
        setMeta({ total: res.total, total_pages: res.total_pages });
        setPage(1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [perPage]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setLoading(true);
    fetchActivities(nextPage, perPage)
      .then((res) => {
        setActivities((prev) => [...prev, ...res.activities]);
        setMeta({ total: res.total, total_pages: res.total_pages });
        setPage(nextPage);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, perPage]);

  const hasMore = meta ? page < meta.total_pages : false;

  return { activities, loading, error, loadMore, hasMore, total: meta?.total ?? 0 };
}
