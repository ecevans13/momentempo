import { useState, useEffect, useCallback } from "react";
import {
  fetchHeatmap,
  fetchRacePredictions,
  fetchWhatsWorking,
  fetchFitness,
  fetchWeeklyReport,
  fetchCoachAdvice,
  fetchHealthSummary,
} from "../api/client";
import type {
  HeatmapResponse,
  RacePredictionsResponse,
  WhatsWorkingResponse,
  FitnessResponse,
  WeeklyReportResponse,
  CoachResponse,
  HealthSummaryResponse,
} from "../api/types";

export function useHeatmap(months: number = 12) {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchHeatmap(months)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [months]);

  return { data, loading, error };
}

export function useRacePredictions() {
  const [data, setData] = useState<RacePredictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchRacePredictions()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useWhatsWorking() {
  const [data, setData] = useState<WhatsWorkingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWhatsWorking()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useFitness(months: number = 6, lthr?: number) {
  const [data, setData] = useState<FitnessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchFitness(months, lthr)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [months, lthr]);

  return { data, loading, error };
}

export function useWeeklyReport() {
  const [data, setData] = useState<WeeklyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchWeeklyReport()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

export function useCoachAdvice() {
  const [data, setData] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCoachAdvice()
      .then(setData)
      .catch((e) => {
        if (e.message.includes("503")) {
          setError("AI coach not configured. Set ANTHROPIC_API_KEY to enable.");
        } else if (e.message.includes("502")) {
          setError("AI coach temporarily unavailable. Try again later.");
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error, fetch };
}

export function useHealthSummary() {
  const [data, setData] = useState<HealthSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchHealthSummary()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
