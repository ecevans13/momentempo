import { forwardRef } from "react";
import RouteThumb from "./RouteThumb";
import type { LandingActivity } from "../api/types";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatRelativeDate,
} from "../utils/format";

const SPORT_ICONS: Record<string, string> = {
  Run: "\u{1F3C3}",
  TrailRun: "\u26F0\uFE0F",
  VirtualRun: "\u{1F5A5}\uFE0F",
  Ride: "\u{1F6B4}",
  Swim: "\u{1F3CA}",
  Hike: "\u{1F97E}",
  Walk: "\u{1F6B6}",
  Workout: "\u{1F4AA}",
  WeightTraining: "\u{1F3CB}\uFE0F",
};

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);

interface ActivityCard3DProps {
  activity: LandingActivity;
}

const ActivityCard3D = forwardRef<HTMLDivElement, ActivityCard3DProps>(
  ({ activity }, ref) => {
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
        className="absolute w-72 h-80 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col will-change-transform"
        style={{ opacity: 0, top: "50%", left: "50%", marginTop: "-10rem", marginLeft: "-9rem" }}
      >
        {/* Route thumbnail or fallback */}
        <div className="flex-1 flex items-center justify-center bg-black/20 overflow-hidden">
          {hasRoute ? (
            <RouteThumb polyline={activity.summary_polyline!} width={288} height={200} />
          ) : (
            <div className="text-center">
              <span className="text-5xl">{icon}</span>
              <div className="mt-2 text-sm text-gray-400">
                {activity.distance > 0 ? formatDistance(activity.distance) : ""}
                {activity.distance > 0 && activity.moving_time > 0 ? " \u00B7 " : ""}
                {activity.moving_time > 0 ? formatDuration(activity.moving_time) : ""}
              </div>
            </div>
          )}
        </div>

        {/* Info bar */}
        <div className="p-3 bg-black/30">
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
