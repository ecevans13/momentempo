import { useState, useEffect } from "react";
import {
  fetchHeatmap,
  fetchRacePredictions,
  fetchWhatsWorking,
} from "../api/client";
import type {
  HeatmapResponse,
  RacePredictionsResponse,
  WhatsWorkingResponse,
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
