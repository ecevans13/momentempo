import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTrends } from "../hooks/useDashboard";
import type { Metric, Granularity } from "../api/types";

const METRICS: { value: Metric; label: string }[] = [
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
  { value: "pace", label: "Pace" },
  { value: "elevation", label: "Elevation" },
  { value: "count", label: "Count" },
];

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function formatTickValue(value: number, metric: Metric): string {
  switch (metric) {
    case "distance":
      return `${(value / 1609.344).toFixed(0)}`;
    case "duration":
      return `${(value / 3600).toFixed(1)}`;
    case "pace":
      if (value === 0) return "0";
      // s/km → min:sec/mi
      const sPerMile = (value * 1609.344) / 1000;
      const m = Math.floor(sPerMile / 60);
      const s = Math.round(sPerMile % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    case "elevation":
      return `${Math.round(value / 0.3048)}`;
    case "count":
      return `${value}`;
  }
}

function getYAxisLabel(metric: Metric): string {
  switch (metric) {
    case "distance": return "mi";
    case "duration": return "hours";
    case "pace": return "min/mi";
    case "elevation": return "ft";
    case "count": return "";
  }
}

const TIMEFRAMES: { value: number; label: string }[] = [
  { value: 3, label: "3M" },
  { value: 6, label: "6M" },
  { value: 12, label: "1Y" },
  { value: 24, label: "2Y" },
  { value: 60, label: "All" },
];

export default function TrendChart({ sportType }: { sportType?: string }) {
  const [metric, setMetric] = useState<Metric>("distance");
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [months, setMonths] = useState(12);
  const { data, loading, error } = useTrends(metric, granularity, months, sportType);

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Trends</h2>
        <div className="flex gap-2">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm rounded-md px-2 py-1 border border-gray-200 dark:border-gray-700"
          >
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {GRANULARITIES.map((g) => (
              <button
                key={g.value}
                onClick={() => setGranularity(g.value)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  granularity === g.value
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.value}
                onClick={() => setMonths(t.value)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  months === t.value
                    ? "bg-indigo-600 text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
        {loading || !data ? (
          <div className="h-64 flex items-center justify-center text-gray-500">Loading...</div>
        ) : data.data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-500">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.data}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="period"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#374151" }}
                tickFormatter={(period: string) => {
                  // "2025-W03" → week start date, "2025-03" → "Mar '25"
                  if (period.includes("-W")) {
                    const [yearStr, weekStr] = period.split("-W");
                    const year = parseInt(yearStr);
                    const week = parseInt(weekStr);
                    // ISO week to date: Jan 4 is always in week 1
                    const jan4 = new Date(year, 0, 4);
                    const start = new Date(jan4);
                    start.setDate(jan4.getDate() - jan4.getDay() + 1 + (week - 1) * 7);
                    return start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  }
                  // Monthly: "2025-03" → "Mar '25"
                  const [y, m] = period.split("-");
                  const d = new Date(parseInt(y), parseInt(m) - 1);
                  return d.toLocaleDateString("en-US", { month: "short" }) + " '" + y.slice(2);
                }}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#374151" }}
                tickFormatter={(v) => formatTickValue(v, metric)}
                label={{
                  value: getYAxisLabel(metric),
                  angle: -90,
                  position: "insideLeft",
                  fill: "#6b7280",
                  fontSize: 12,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  color: "#f3f4f6",
                }}
                labelFormatter={(period: string) => {
                  if (period.includes("-W")) {
                    const [yearStr, weekStr] = period.split("-W");
                    const year = parseInt(yearStr);
                    const week = parseInt(weekStr);
                    const jan4 = new Date(year, 0, 4);
                    const start = new Date(jan4);
                    start.setDate(jan4.getDate() - jan4.getDay() + 1 + (week - 1) * 7);
                    const end = new Date(start);
                    end.setDate(start.getDate() + 6);
                    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    return `${fmt(start)} – ${fmt(end)}`;
                  }
                  const [y, m] = period.split("-");
                  const d = new Date(parseInt(y), parseInt(m) - 1);
                  return d.toLocaleDateString("en-US", { month: "short" }) + " '" + y.slice(2);
                }}
                formatter={(value: number) => [formatTickValue(value, metric), metric]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#chartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
