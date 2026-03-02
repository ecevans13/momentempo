import { useState } from "react";
import { useHeatmap } from "../hooks/useInsights";

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
const CELL_SIZE = 13;
const CELL_GAP = 3;

const COLORS = [
  "rgb(229, 231, 235)", // gray-200 (no activity)
  "rgb(255, 237, 213)", // orange-100
  "rgb(253, 186, 116)", // orange-300
  "rgb(249, 115, 22)",  // orange-500
  "rgb(194, 65, 12)",   // orange-700
];

const COLORS_DARK = [
  "rgb(55, 65, 81)",    // gray-700
  "rgb(124, 45, 18)",   // orange-900
  "rgb(194, 65, 12)",   // orange-700
  "rgb(234, 88, 12)",   // orange-600
  "rgb(249, 115, 22)",  // orange-500
];

function getColor(load: number, maxLoad: number, isDark: boolean): string {
  const palette = isDark ? COLORS_DARK : COLORS;
  if (load === 0) return palette[0];
  const level = Math.min(4, Math.ceil((load / maxLoad) * 4));
  return palette[level];
}

function computeStreaks(dates: string[]): { activeDays: number; longestStreak: number } {
  if (dates.length === 0) return { activeDays: 0, longestStreak: 0 };

  const dateSet = new Set(dates);
  let longestStreak = 0;
  let currentStreak = 0;

  // Walk through the date range
  const sorted = [...dates].sort();
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    if (dateSet.has(key)) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return { activeDays: dates.length, longestStreak };
}

export default function TrainingHeatmap() {
  const { data, loading, error } = useHeatmap(12);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; load: number } | null>(null);
  const isDark = document.documentElement.classList.contains("dark");

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (!data || data.days.length === 0) {
    return <p className="text-sm text-gray-500">No activity data yet.</p>;
  }

  // Build 53x7 grid (columns = weeks, rows = days of week)
  const dayMap = new Map(data.days.map((d) => [d.date, d.load]));
  const maxLoad = data.max_load || 1;

  // Determine the grid start: go back ~53 weeks from today
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 52 * 7 - startDate.getDay() + 1); // Start on Monday

  const weeks: { date: string; load: number; dow: number; weekIdx: number }[][] = [];
  let currentWeek: typeof weeks[0] = [];
  let weekIdx = 0;

  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const dow = (d.getDay() + 6) % 7; // Monday=0

    if (dow === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
      weekIdx++;
    }

    currentWeek.push({
      date: key,
      load: dayMap.get(key) ?? 0,
      dow,
      weekIdx,
    });
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const { activeDays, longestStreak } = computeStreaks(data.days.map((d) => d.date));

  const svgWidth = weeks.length * (CELL_SIZE + CELL_GAP) + 30;
  const svgHeight = 7 * (CELL_SIZE + CELL_GAP) + 4;

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          className="block"
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Day labels */}
          {DAY_LABELS.map((label, i) =>
            label ? (
              <text
                key={i}
                x={0}
                y={i * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 1}
                fontSize={10}
                fill="currentColor"
                className="text-gray-400"
              >
                {label}
              </text>
            ) : null,
          )}

          {/* Grid cells */}
          {weeks.map((week, wi) =>
            week.map((cell) => (
              <rect
                key={cell.date}
                x={wi * (CELL_SIZE + CELL_GAP) + 30}
                y={cell.dow * (CELL_SIZE + CELL_GAP)}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                fill={getColor(cell.load, maxLoad, isDark)}
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  setTooltip({ x: rect.x + rect.width / 2, y: rect.y, date: cell.date, load: cell.load });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )),
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-xs rounded bg-gray-800 text-white pointer-events-none"
          style={{ left: tooltip.x - 50, top: tooltip.y - 32 }}
        >
          {tooltip.date} &middot; {tooltip.load > 0 ? `${tooltip.load.toFixed(0)} load` : "Rest day"}
        </div>
      )}

      {/* Summary stats */}
      <div className="flex gap-6 mt-4 text-sm text-gray-500 dark:text-gray-400">
        <span><strong className="text-gray-900 dark:text-white">{activeDays}</strong> active days</span>
        <span><strong className="text-gray-900 dark:text-white">{longestStreak}</strong> day longest streak</span>
      </div>
    </div>
  );
}
