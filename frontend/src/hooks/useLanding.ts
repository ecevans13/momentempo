import { useState, useEffect } from "react";
import type { LandingResponse } from "../api/types";
import { fetchLandingData } from "../api/client";

export function useLandingData() {
  const [data, setData] = useState<LandingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLandingData()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}
