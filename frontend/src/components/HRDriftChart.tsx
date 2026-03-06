import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Split } from "../api/types";
import { formatPace } from "../utils/format";

interface HRDriftChartProps {
  splits: Split[];
}

export default function HRDriftChart({ splits }: HRDriftChartProps) {
  const data = splits
    .filter((s) => s.distance > 0 && s.average_heartrate !== null)
    .map((s) => ({
      split: s.split,
      pace: (s.moving_time / s.distance) * 1000, // s/km
      hr: Math.round(s.average_heartrate!),
    }));

  if (data.length < 2) return null;

  // Drift detection: compare first third vs last third
  const third = Math.max(1, Math.floor(data.length / 3));
  const firstThird = data.slice(0, third);
  const lastThird = data.slice(-third);

  const avgHRFirst = firstThird.reduce((s, d) => s + d.hr, 0) / firstThird.length;
  const avgHRLast = lastThird.reduce((s, d) => s + d.hr, 0) / lastThird.length;
  const avgPaceFirst = firstThird.reduce((s, d) => s + d.pace, 0) / firstThird.length;
  const avgPaceLast = lastThird.reduce((s, d) => s + d.pace, 0) / lastThird.length;

  const hrChange = ((avgHRLast - avgHRFirst) / avgHRFirst) * 100;
  const paceChange = Math.abs((avgPaceLast - avgPaceFirst) / avgPaceFirst) * 100;
  const driftDetected = hrChange > 5 && paceChange < 5;

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis
            dataKey="split"
            tick={{ fontSize: 12 }}
            label={{ value: "Split", position: "insideBottomRight", offset: -4, fontSize: 12 }}
          />
          <YAxis
            yAxisId="pace"
            reversed
            tickFormatter={(v: number) => formatPace(v)}
            tick={{ fontSize: 11 }}
            width={80}
          />
          <YAxis
            yAxisId="hr"
            orientation="right"
            tick={{ fontSize: 11 }}
            width={52}
            tickFormatter={(v: number) => `${v}`}
            label={{ value: "bpm", angle: 90, position: "insideRight", offset: 14, fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === "pace") return [formatPace(value), "Pace"];
              return [`${value} bpm`, "HR"];
            }}
            labelFormatter={(label: number) => `Split ${label}`}
            contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8, fontSize: 13 }}
            labelStyle={{ color: "#9ca3af" }}
            itemSorter={(item) => (item.dataKey === "hr" ? 0 : 1)}
          />
          <Line
            yAxisId="pace"
            type="monotone"
            dataKey="pace"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3, fill: "#6366f1" }}
            name="pace"
          />
          <Line
            yAxisId="hr"
            type="monotone"
            dataKey="hr"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3, fill: "#ef4444" }}
            name="hr"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {driftDetected && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
          Cardiac drift detected: HR rose {Math.round(avgHRLast - avgHRFirst)} bpm over{" "}
          {data.length} splits at similar pace
        </p>
      )}
    </div>
  );
}
