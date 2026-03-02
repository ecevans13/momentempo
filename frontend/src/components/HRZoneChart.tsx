import type { HRZone } from "../api/types";
import { formatDuration } from "../utils/format";

// Yellow-to-red gradient: Zone 1 (easy) → Zone 5 (max effort)
const ZONE_COLORS = [
  "bg-amber-300",     // Zone 1 — Recovery
  "bg-amber-400",     // Zone 2 — Aerobic
  "bg-orange-500",    // Zone 3 — Tempo
  "bg-red-500",       // Zone 4 — Threshold
  "bg-red-700",       // Zone 5 — VO2 Max
];

const ZONE_DESCRIPTIONS = [
  "Recovery",
  "Aerobic",
  "Tempo",
  "Threshold",
  "VO2 Max",
];

interface HRZoneChartProps {
  zones: HRZone[];
  totalTime: number;
}

export default function HRZoneChart({ zones, totalTime }: HRZoneChartProps) {
  if (zones.length === 0 || totalTime === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No heart rate zone data available.
      </p>
    );
  }

  const maxTime = Math.max(...zones.map((z) => z.time_seconds));

  return (
    <div className="space-y-3">
      {[...zones].reverse().map((zone, _ri, arr) => {
        const i = arr.length - 1 - _ri;
        const pct = totalTime > 0 ? (zone.time_seconds / totalTime) * 100 : 0;
        const barWidth = maxTime > 0 ? (zone.time_seconds / maxTime) * 100 : 0;
        const color = ZONE_COLORS[i] ?? "bg-gray-400";
        const desc = ZONE_DESCRIPTIONS[i] ?? "";
        const hrRange = zone.max_hr > 0
          ? `${zone.min_hr}–${zone.max_hr} bpm`
          : `${zone.min_hr}+ bpm`;

        return (
          <div key={zone.zone} className="flex items-center gap-3">
            <div className="w-20 text-xs text-gray-500 dark:text-gray-400 text-right shrink-0">
              <div className="font-medium text-gray-700 dark:text-gray-200">{zone.zone}</div>
              <div>{desc}</div>
            </div>
            <div className="flex-1">
              <div className="h-6 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded ${color} transition-all duration-500`}
                  style={{ width: `${Math.max(barWidth, 1)}%` }}
                />
              </div>
            </div>
            <div className="w-20 text-xs text-right shrink-0">
              <div className="text-gray-700 dark:text-gray-200">
                {formatDuration(zone.time_seconds)}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {pct.toFixed(0)}%
              </div>
            </div>
            <div className="w-24 text-xs text-gray-500 dark:text-gray-400 text-right shrink-0 hidden sm:block">
              {hrRange}
            </div>
          </div>
        );
      })}
    </div>
  );
}
