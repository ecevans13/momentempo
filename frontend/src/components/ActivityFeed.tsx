import { useActivities } from "../hooks/useDashboard";
import {
  formatDistance,
  formatDuration,
  formatRelativeDate,
  formatElevation,
  formatPace,
} from "../utils/format";
import type { ActivityItem } from "../api/types";

const SPORT_ICONS: Record<string, string> = {
  Run: "🏃",
  TrailRun: "⛰️",
  VirtualRun: "🖥️",
  Ride: "🚴",
  GravelRide: "🚵",
  VirtualRide: "🖥️",
  Swim: "🏊",
  Hike: "🥾",
  Walk: "🚶",
  Workout: "💪",
};

function SportBadge({ sportType }: { sportType: string }) {
  const icon = SPORT_ICONS[sportType] ?? "🏅";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
      <span>{icon}</span>
      {sportType}
    </span>
  );
}

function ActivityCard({ activity }: { activity: ActivityItem }) {
  const isRun = ["Run", "TrailRun", "VirtualRun", "Treadmill"].includes(activity.sport_type);
  const paceDisplay = isRun && activity.distance > 0
    ? formatPace((activity.moving_time / activity.distance) * 1000)
    : null;

  return (
    <div className="flex items-start gap-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 transition-shadow duration-200 hover:shadow-lg hover:shadow-orange-500/10 dark:hover:shadow-orange-500/20 hover:border-orange-300/30 dark:hover:border-orange-500/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{activity.name}</h3>
          <SportBadge sportType={activity.sport_type} />
        </div>
        <p className="text-xs text-gray-500 mb-2">
          {formatRelativeDate(activity.start_date)}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
          {activity.distance > 0 && (
            <span>{formatDistance(activity.distance)}</span>
          )}
          <span>{formatDuration(activity.moving_time)}</span>
          {paceDisplay && <span>{paceDisplay}</span>}
          {activity.total_elevation_gain > 0 && (
            <span>{formatElevation(activity.total_elevation_gain)}</span>
          )}
          {activity.has_heartrate && activity.average_heartrate && (
            <span>{Math.round(activity.average_heartrate)} bpm</span>
          )}
        </div>
      </div>
      {activity.kudos_count > 0 && (
        <span className="text-xs text-gray-500 whitespace-nowrap">
          👍 {activity.kudos_count}
        </span>
      )}
    </div>
  );
}

export default function ActivityFeed() {
  const { activities, loading, error, loadMore, hasMore, total } = useActivities();

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activities</h2>
        {total > 0 && (
          <span className="text-sm text-gray-500">{total} total</span>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      <div className="space-y-3">
        {activities.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
      </div>

      {loading && (
        <p className="text-center text-gray-500 text-sm mt-4">Loading...</p>
      )}

      {hasMore && !loading && (
        <div className="text-center mt-4">
          <button
            onClick={loadMore}
            className="px-4 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {!loading && activities.length === 0 && !error && (
        <p className="text-center text-gray-500 text-sm py-8">
          No activities yet. Click Sync to fetch from Strava.
        </p>
      )}
    </section>
  );
}
