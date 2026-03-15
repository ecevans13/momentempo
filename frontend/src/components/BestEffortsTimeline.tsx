import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
} from "recharts";
import { fetchBestEffortsProgression } from "../api/client";
import type { BestEffortsProgressionResponse } from "../api/types";

const DISTANCE_COLORS: Record<string, string> = {
  "1 Mile": "#6366f1",
  "5K": "#14b8a6",
  "10K": "#10b981",
  "Half Marathon": "#8b5cf6",
  "Marathon": "#f59e0b",
};

function formatSeconds(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type ChartDatum = Record<string, string | number | undefined> & { date: string };

export default function BestEffortsTimeline() {
  const [data, setData] = useState<BestEffortsProgressionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBestEffortsProgression()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load best efforts");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Best Efforts Progression</h2>
        <p className="text-gray-400 text-sm">Loading best efforts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Best Efforts Progression</h2>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  const progression = data?.progression ?? {};
  const activeDistances = Object.keys(progression);

  if (activeDistances.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Best Efforts Progression</h2>
        <p className="text-gray-400 text-sm">
          No best effort data yet. Sync best efforts from the Trophies page to see your progression.
        </p>
      </div>
    );
  }

  // Build wide-format chart data: each row is a date with one column per distance
  const dateMap = new Map<string, Record<string, number>>();
  for (const dist of activeDistances) {
    for (const point of progression[dist]) {
      const row = dateMap.get(point.date) ?? {};
      row[dist] = point.moving_time;
      dateMap.set(point.date, row);
    }
  }

  const chartData: ChartDatum[] = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-4">
      <h2 className="text-lg font-semibold text-gray-100 mb-3">Best Efforts Progression</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            minTickGap={60}
            tickFormatter={(date: string) =>
              new Date(date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
            }
          />
          <YAxis
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#374151" }}
            reversed
            tickFormatter={(s: number) => formatSeconds(s)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "8px",
              color: "#f3f4f6",
            }}
            formatter={(value: number, name: string) => [formatSeconds(value), name]}
            labelFormatter={(label: string) => {
              const d = new Date(label);
              return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
            }}
          />
          <Legend />
          {activeDistances.map((dist) => (
            <Line
              key={dist}
              type="monotone"
              dataKey={dist}
              stroke={DISTANCE_COLORS[dist] ?? "#6b7280"}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
