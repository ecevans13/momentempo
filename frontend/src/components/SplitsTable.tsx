import type { Split } from "../api/types";
import { formatPace, formatDuration } from "../utils/format";

interface SplitsTableProps {
  splitsKm: Split[];
  splitsMi: Split[];
}

export default function SplitsTable({ splitsKm, splitsMi }: SplitsTableProps) {
  // Use mile splits if available, otherwise km
  const useMiles = splitsMi.length > 0;
  const splits = useMiles ? splitsMi : splitsKm;
  const unitLabel = useMiles ? "mi" : "km";

  if (splits.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No split data available for this activity.
      </p>
    );
  }

  // Calculate pace for each split: seconds per km
  const paces = splits.map((s) => {
    if (s.distance <= 0 || s.moving_time <= 0) return null;
    // s/km = (moving_time / distance) * 1000
    return (s.moving_time / s.distance) * 1000;
  });

  // Find fastest/slowest for color coding
  const validPaces = paces.filter((p): p is number => p !== null && p > 0);
  const minPace = validPaces.length > 0 ? Math.min(...validPaces) : 0;
  const maxPace = validPaces.length > 0 ? Math.max(...validPaces) : 0;

  function paceBarWidth(pace: number | null): string {
    if (pace === null || maxPace === minPace) return "0%";
    // Invert: fastest pace (lowest value) = widest bar
    const normalized = 1 - (pace - minPace) / (maxPace - minPace);
    return `${30 + normalized * 70}%`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
            <th className="py-2 pr-3 font-medium">{unitLabel}</th>
            <th className="py-2 pr-3 font-medium">Pace</th>
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">HR</th>
            <th className="py-2 pr-3 font-medium">Elev</th>
            <th className="py-2 font-medium w-24"></th>
          </tr>
        </thead>
        <tbody>
          {splits.map((s, i) => {
            const pace = paces[i];
            return (
              <tr
                key={s.split}
                className="border-b border-gray-100 dark:border-gray-800/50 text-gray-700 dark:text-gray-300"
              >
                <td className="py-2 pr-3 font-medium">{s.split}</td>
                <td className="py-2 pr-3">
                  {pace !== null ? formatPace(pace) : "—"}
                </td>
                <td className="py-2 pr-3">{formatDuration(s.moving_time)}</td>
                <td className="py-2 pr-3">
                  {s.average_heartrate ? Math.round(s.average_heartrate) : "—"}
                </td>
                <td className="py-2 pr-3">
                  {s.elevation_difference !== 0
                    ? `${s.elevation_difference > 0 ? "+" : ""}${Math.round(s.elevation_difference * 3.281)}ft`
                    : "—"}
                </td>
                <td className="py-2">
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: paceBarWidth(pace) }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
