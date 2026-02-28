import { useState } from "react";
import { useSummary } from "../hooks/useDashboard";
import PeriodSelector from "./PeriodSelector";
import { formatDistance, formatDuration, formatElevation, formatNumber } from "../utils/format";
import type { Period } from "../api/types";

interface CardProps {
  label: string;
  value: string;
}

function Card({ label, value }: CardProps) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

export default function MetricCards() {
  const [period, setPeriod] = useState<Period>("month");
  const { data, loading, error } = useSummary(period);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Overview</h2>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          label="Total Distance"
          value={loading || !data ? "..." : formatDistance(data.total_distance_m)}
        />
        <Card
          label="Activities"
          value={loading || !data ? "..." : formatNumber(data.activity_count)}
        />
        <Card
          label="Total Duration"
          value={loading || !data ? "..." : formatDuration(data.total_moving_time_s)}
        />
        <Card
          label="Elevation Gain"
          value={loading || !data ? "..." : formatElevation(data.total_elevation_gain_m)}
        />
      </div>
    </section>
  );
}
