import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { Split } from "../api/types";
import { formatPace } from "../utils/format";

interface PaceDecayChartProps {
  splits: Split[];
}

export default function PaceDecayChart({ splits }: PaceDecayChartProps) {
  const data = splits
    .filter((s) => s.distance > 0)
    .map((s) => ({
      split: s.split,
      pace: (s.moving_time / s.distance) * 1000, // s/km
    }));

  if (data.length < 2) return null;

  const avgPace = data.reduce((sum, d) => sum + d.pace, 0) / data.length;
  const paces = data.map((d) => d.pace);
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const padding = (maxPace - minPace) * 0.15 || 10;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis
          dataKey="split"
          tick={{ fontSize: 12 }}
          label={{ value: "Split", position: "insideBottomRight", offset: -4, fontSize: 12 }}
        />
        <YAxis
          reversed
          domain={[minPace - padding, maxPace + padding]}
          tickFormatter={(v: number) => formatPace(v)}
          tick={{ fontSize: 11 }}
          width={72}
        />
        <Tooltip
          formatter={(value: number) => [formatPace(value), "Pace"]}
          labelFormatter={(label: number) => `Split ${label}`}
          contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8, fontSize: 13 }}
          itemStyle={{ color: "#f97316" }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <ReferenceLine
          y={avgPace}
          stroke="#9ca3af"
          strokeDasharray="6 4"
          label={{ value: `Avg ${formatPace(avgPace)}`, position: "right", fill: "#9ca3af", fontSize: 11 }}
        />
        <Line
          type="monotone"
          dataKey="pace"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ r: 3, fill: "#f97316" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
