import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Split } from "../api/types";
import { formatElevation } from "../utils/format";
import { downsampleParallel } from "../utils/downsample";

interface ElevationProfileProps {
  splits: Split[];
  gpsAltitude?: number[] | null;
  gpsDistance?: number[] | null;
}

export default function ElevationProfile({ splits, gpsAltitude, gpsDistance }: ElevationProfileProps) {
  const useGPS =
    gpsAltitude &&
    gpsDistance &&
    gpsAltitude.length > 1 &&
    gpsDistance.length > 1;

  if (useGPS) {
    // Downsample GPS altitude and distance in parallel to ~500 points
    const MAX_POINTS = 500;
    const [sampledDist, sampledAlt] =
      gpsAltitude.length > MAX_POINTS
        ? (downsampleParallel([gpsDistance, gpsAltitude], MAX_POINTS) as [number[], number[]])
        : [gpsDistance, gpsAltitude];

    const data = sampledDist.map((d, i) => ({
      distance: d / 1000, // convert meters to km
      elevation: Math.round(sampledAlt[i]),
    }));

    return (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis
            dataKey="distance"
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => `${v.toFixed(1)} km`}
            label={{ value: "Distance", position: "insideBottomRight", offset: -4, fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(v: number) => formatElevation(v)}
            tick={{ fontSize: 11 }}
            width={72}
            label={{ value: "Elevation", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#9ca3af" }}
          />
          <Tooltip
            formatter={(value: number) => [formatElevation(value), "Elevation"]}
            labelFormatter={(v: number) => `${v.toFixed(1)} km`}
            contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8, fontSize: 13 }}
            itemStyle={{ color: "#22c55e" }}
            labelStyle={{ color: "#9ca3af" }}
          />
          <Area
            type="monotone"
            dataKey="elevation"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#elevGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Fallback: splits-based cumulative elevation
  let cumulative = 0;
  const data = splits.map((s) => {
    cumulative += s.elevation_difference;
    return {
      split: s.split,
      elevation: cumulative,
    };
  });

  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis
          dataKey="split"
          tick={{ fontSize: 12 }}
          label={{ value: "Split", position: "insideBottomRight", offset: -4, fontSize: 12 }}
        />
        <YAxis
          tickFormatter={(v: number) => formatElevation(v)}
          tick={{ fontSize: 11 }}
          width={72}
          label={{ value: "Elevation", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#9ca3af" }}
        />
        <Tooltip
          formatter={(value: number) => [formatElevation(value), "Elevation"]}
          labelFormatter={(label: number) => `Split ${label}`}
          contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8, fontSize: 13 }}
          itemStyle={{ color: "#22c55e" }}
          labelStyle={{ color: "#9ca3af" }}
        />
        <Area
          type="monotone"
          dataKey="elevation"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#elevGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
