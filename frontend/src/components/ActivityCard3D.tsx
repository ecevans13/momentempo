import { forwardRef } from "react";
import RouteThumb from "./RouteThumb";
import type { LandingActivity } from "../api/types";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatRelativeDate,
  formatElevation,
} from "../utils/format";

const SPORT_ICONS: Record<string, string> = {
  Run: "\u{1F3C3}",
  TrailRun: "\u26F0\uFE0F",
  VirtualRun: "\u{1F5A5}\uFE0F",
  Treadmill: "\u{1F3C3}",
  Ride: "\u{1F6B4}",
  Swim: "\u{1F3CA}",
  Hike: "\u{1F97E}",
  Walk: "\u{1F6B6}",
  Workout: "\u{1F4AA}",
  WeightTraining: "\u{1F3CB}\uFE0F",
  Yoga: "\u{1F9D8}",
};

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);

// Card dimensions (w-80 = 320px, h-96 = 384px)
export const CARD_W = 320;
export const CARD_H = 384;

interface ActivityCard3DProps {
  activity: LandingActivity;
  onClick?: () => void;
}

const ActivityCard3D = forwardRef<HTMLDivElement, ActivityCard3DProps>(
  ({ activity, onClick }, ref) => {
    const hasRoute = !!activity.summary_polyline;
    const isRun = RUN_TYPES.has(activity.sport_type);
    const paceDisplay =
      isRun && activity.distance > 0
        ? formatPace((activity.moving_time / activity.distance) * 1000)
        : null;
    const icon = SPORT_ICONS[activity.sport_type] ?? "\u{1F3C5}";

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={`absolute w-80 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col will-change-transform ${onClick ? "cursor-pointer" : ""}`}
        style={{
          opacity: 0,
          top: "50%",
          left: "50%",
          height: CARD_H,
          marginTop: -(CARD_H / 2),
          marginLeft: -(CARD_W / 2),
        }}
      >
        {hasRoute ? (
          /* Route map thumbnail */
          <div className="flex-1 relative overflow-hidden">
            <RouteThumb polyline={activity.summary_polyline!} width={CARD_W} height={CARD_H - 72} />
          </div>
        ) : (
          /* Indoor/no-route: stats-focused card */
          <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black px-4">
            <span className="text-6xl mb-4">{icon}</span>
            <div className="text-center space-y-2">
              {activity.distance > 0 && (
                <div className="text-2xl font-bold text-white">
                  {formatDistance(activity.distance)}
                </div>
              )}
              <div className={`${activity.distance > 0 ? "text-lg text-gray-300" : "text-2xl font-bold text-white"}`}>
                {formatDuration(activity.moving_time)}
              </div>
              {paceDisplay && (
                <div className="text-lg text-indigo-400">{paceDisplay}</div>
              )}
              {activity.has_heartrate && activity.average_heartrate && (
                <div className="text-sm text-red-400">
                  {Math.round(activity.average_heartrate)} bpm avg
                </div>
              )}
              {activity.total_elevation_gain > 10 && (
                <div className="text-sm text-teal-400">
                  {formatElevation(activity.total_elevation_gain)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info bar */}
        <div className="p-3 bg-black/40 shrink-0" style={{ height: 72 }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{icon}</span>
            <h3 className="text-sm font-medium text-white truncate">
              {activity.name}
            </h3>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-300">
            <span>{formatRelativeDate(activity.start_date)}</span>
            {activity.distance > 0 && (
              <span>{formatDistance(activity.distance)}</span>
            )}
            <span>{formatDuration(activity.moving_time)}</span>
            {paceDisplay && <span>{paceDisplay}</span>}
          </div>
        </div>
      </div>
    );
  }
);

ActivityCard3D.displayName = "ActivityCard3D";

export default ActivityCard3D;
