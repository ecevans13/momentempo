import { useState } from "react";
import { useHeatmap } from "../hooks/useInsights";
import { fetchHeatmapDay } from "../api/client";
import type { HeatmapDayActivity } from "../api/types";
import { formatDistance, formatDuration, formatPace, formatElevation } from "../utils/format";

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];
const CELL_SIZE = 13;
const CELL_GAP = 3;

const COLORS = [
  "rgb(229, 231, 235)", // gray-200 (no activity)
  "rgb(204, 251, 241)", // teal-100
  "rgb(94, 234, 212)",  // teal-300
  "rgb(20, 184, 166)",  // teal-500
  "rgb(15, 118, 110)",  // teal-700
];

const COLORS_DARK = [
  "rgb(55, 65, 81)",    // gray-700
  "rgb(19, 78, 74)",    // teal-900
  "rgb(15, 118, 110)",  // teal-700
  "rgb(13, 148, 136)",  // teal-600
  "rgb(20, 184, 166)",  // teal-500
];

const SPORT_ICONS: Record<string, string> = {
  Run: "\u{1F3C3}", TrailRun: "\u26F0\uFE0F", VirtualRun: "\u{1F5A5}\uFE0F",
  Ride: "\u{1F6B4}", GravelRide: "\u{1F6B5}", VirtualRide: "\u{1F5A5}\uFE0F",
  Swim: "\u{1F3CA}", Hike: "\u{1F97E}", Walk: "\u{1F6B6}", Workout: "\u{1F4AA}",
};

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function DayDrilldown({
  date,
  activities,
  loading,
  onClose,
  onSelectActivity,
}: {
  date: string;
  activities: HeatmapDayActivity[];
  loading: boolean;
  onClose: () => void;
  onSelectActivity: (id: number) => void;
}) {
  return (
    <div className="mt-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{formatDate(date)}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="py-4 text-center">
          <div className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-gray-500">Rest day — no activities recorded.</p>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => {
            const icon = SPORT_ICONS[a.sport_type] ?? "\u{1F3C5}";
            const isRun = RUN_TYPES.has(a.sport_type);
            const pace = isRun && a.distance > 0
              ? formatPace((a.moving_time / a.distance) * 1000)
              : null;

            return (
              <button
                key={a.id}
                onClick={() => onSelectActivity(a.id)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 w-full text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <span className="text-base flex-shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
                    {a.distance > 0 && <span>{formatDistance(a.distance)}</span>}
                    <span>{formatDuration(a.moving_time)}</span>
                    {pace && <span>{pace}</span>}
                    {a.total_elevation_gain > 0 && <span>{formatElevation(a.total_elevation_gain)}</span>}
                    {a.has_heartrate && a.average_heartrate && (
                      <span>{Math.round(a.average_heartrate)} bpm</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TrainingHeatmap({ onSelectActivity }: { onSelectActivity: (id: number) => void }) {
  const { data, loading, error } = useHeatmap(12);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; load: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayActivities, setDayActivities] = useState<HeatmapDayActivity[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const isDark = document.documentElement.classList.contains("dark");

  function handleDayClick(date: string) {
    if (selectedDate === date) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(date);
    setDayLoading(true);
    fetchHeatmapDay(date)
      .then((res) => setDayActivities(res.activities))
      .catch(() => setDayActivities([]))
      .finally(() => setDayLoading(false));
  }

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
                stroke={cell.date === selectedDate ? "#14b8a6" : "none"}
                strokeWidth={cell.date === selectedDate ? 2 : 0}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  setTooltip({ x: rect.x + rect.width / 2, y: rect.y, date: cell.date, load: cell.load });
                }}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => handleDayClick(cell.date)}
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

      {/* Day drilldown */}
      {selectedDate && (
        <DayDrilldown
          date={selectedDate}
          activities={dayActivities}
          loading={dayLoading}
          onClose={() => setSelectedDate(null)}
          onSelectActivity={onSelectActivity}
        />
      )}
    </div>
  );
}
