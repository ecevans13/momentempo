import { useWeeklyReport } from "../hooks/useInsights";
import { formatDistance, formatDuration, formatPace } from "../utils/format";

function ChangeBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <span
      className={`ml-1.5 inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        isPositive
          ? "bg-emerald-500/10 text-emerald-500"
          : "bg-red-500/10 text-red-500"
      }`}
    >
      {isPositive ? "+" : ""}
      {value.toFixed(0)}%
    </span>
  );
}

export default function WeeklyReport() {
  const { data, loading, error } = useWeeklyReport();

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400 py-4">{error}</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Summary text */}
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
        {data.summary_text}
      </p>

      {data.has_data && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              label="Distance"
              value={formatDistance(data.stats.total_distance)}
              change={data.vs_last_week.total_distance}
            />
            <StatCard
              label="Duration"
              value={formatDuration(data.stats.total_duration)}
              change={data.vs_last_week.total_duration}
            />
            <StatCard
              label="Runs"
              value={String(data.stats.run_count)}
              change={data.vs_last_week.run_count}
            />
            {data.stats.avg_pace && (
              <StatCard label="Avg Pace" value={formatPace(data.stats.avg_pace)} />
            )}
            {data.stats.longest_run > 0 && (
              <StatCard
                label="Longest Run"
                value={formatDistance(data.stats.longest_run)}
                change={data.vs_last_week.longest_run}
              />
            )}
            <StatCard label="Activities" value={String(data.stats.activity_count)} />
          </div>

          {/* Zone distribution bar */}
          {Object.values(data.zone_distribution).some((v) => v > 0) && (
            <div>
              <p className="text-xs text-gray-500 mb-2">HR Zone Distribution</p>
              <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-800">
                {Object.entries(data.zone_distribution).map(([zone, pct]) =>
                  pct > 0 ? (
                    <div
                      key={zone}
                      style={{ width: `${pct}%` }}
                      className={`${zoneColor(zone)} transition-all`}
                      title={`${zone}: ${pct}%`}
                    />
                  ) : null,
                )}
              </div>
              <div className="flex justify-between mt-1.5 text-[10px] text-gray-500">
                {Object.entries(data.zone_distribution).map(([zone, pct]) =>
                  pct > 0 ? (
                    <span key={zone} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${zoneColor(zone)}`} />
                      {zone} {pct}%
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, change }: { label: string; value: string; change?: number }) {
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
      <p className="text-base font-semibold text-gray-900 dark:text-white">
        {value}
        {change !== undefined && <ChangeBadge value={change} />}
      </p>
    </div>
  );
}

function zoneColor(zone: string): string {
  const colors: Record<string, string> = {
    Z1: "bg-gray-400",
    Z2: "bg-blue-400",
    Z3: "bg-emerald-400",
    Z4: "bg-amber-400",
    Z5: "bg-red-500",
  };
  return colors[zone] || "bg-gray-400";
}
