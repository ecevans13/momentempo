import { useState, useEffect } from "react";
import { fetchActivityDetail, fetchActivityZones } from "../api/client";
import type { ActivityDetailResponse, ZonesResponse } from "../api/types";
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatElevation,
  formatRelativeDate,
} from "../utils/format";
import SplitsTable from "./SplitsTable";
import HRZoneChart from "./HRZoneChart";
import HRDriftChart from "./HRDriftChart";
import ElevationProfile from "./ElevationProfile";
import RouteReplay from "./RouteReplay";

const RUN_TYPES = ["Run", "TrailRun", "VirtualRun", "Treadmill"];

interface ActivityDetailProps {
  activityId: number;
  onBack: () => void;
}

export default function ActivityDetail({ activityId, onBack }: ActivityDetailProps) {
  const [detail, setDetail] = useState<ActivityDetailResponse | null>(null);
  const [zones, setZones] = useState<ZonesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetchActivityDetail(activityId),
      fetchActivityZones(activityId).catch(() => ({ has_zones: false, zones: [] }) as ZonesResponse),
    ])
      .then(([detailData, zonesData]) => {
        setDetail(detailData);
        setZones(zonesData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activityId]);

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 mt-3">Loading activity details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button
          onClick={onBack}
          className="text-sm text-indigo-500 hover:text-indigo-400"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!detail) return null;

  const isRun = RUN_TYPES.includes(detail.sport_type);
  const pace = isRun && detail.distance > 0
    ? (detail.moving_time / detail.distance) * 1000
    : null;

  const splits = detail.splits_km.length > 0 ? detail.splits_km : detail.splits_mi;
  const splitsWithHR = splits.filter((s) => s.average_heartrate !== null);
  const hasElevation = splits.some((s) => s.elevation_difference !== 0);

  return (
    <div className="space-y-6">
      {/* Back button + header */}
      <div>
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-3 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{detail.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {detail.sport_type} &middot; {formatRelativeDate(detail.start_date)}
          {detail.device_name && <> &middot; {detail.device_name}</>}
        </p>
        {detail.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mt-2">
            {detail.description}
          </p>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {detail.distance > 0 && (
          <StatCard label="Distance" value={formatDistance(detail.distance)} />
        )}
        <StatCard label="Duration" value={formatDuration(detail.moving_time)} />
        {pace !== null && (
          <StatCard label="Avg Pace" value={formatPace(pace)} />
        )}
        {detail.total_elevation_gain > 0 && (
          <StatCard label="Elevation" value={formatElevation(detail.total_elevation_gain)} />
        )}
        {detail.has_heartrate && detail.average_heartrate && (
          <StatCard label="Avg HR" value={`${Math.round(detail.average_heartrate)} bpm`} />
        )}
        {detail.has_heartrate && detail.max_heartrate && (
          <StatCard label="Max HR" value={`${detail.max_heartrate} bpm`} />
        )}
        {detail.calories > 0 && (
          <StatCard label="Calories" value={`${Math.round(detail.calories)}`} />
        )}
        {detail.elapsed_time !== detail.moving_time && (
          <StatCard label="Elapsed" value={formatDuration(detail.elapsed_time)} />
        )}
      </div>

      {/* Route Replay */}
      {detail.summary_polyline && (
        <Section title="Route Replay">
          <RouteReplay
            polyline={detail.summary_polyline}
            totalDistance={detail.distance}
            totalTime={detail.moving_time}
          />
        </Section>
      )}

      {/* Splits */}
      {(detail.splits_km.length > 0 || detail.splits_mi.length > 0) && (
        <Section title="Splits">
          <SplitsTable splitsKm={detail.splits_km} splitsMi={detail.splits_mi} />
        </Section>
      )}

      {/* HR Zones */}
      {zones && zones.has_zones && zones.zones.length > 0 && (
        <Section title="Heart Rate Zones">
          <HRZoneChart zones={zones.zones} totalTime={zones.total_time_seconds ?? 0} />
        </Section>
      )}

      {/* Pace & HR Drift */}
      {isRun && splitsWithHR.length > 1 && (
        <Section title="Pace & HR Drift">
          <HRDriftChart splits={splitsWithHR} />
        </Section>
      )}

      {/* Elevation Profile */}
      {hasElevation && splits.length > 1 && (
        <Section title="Elevation Profile">
          <ElevationProfile splits={splits} />
        </Section>
      )}

    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}
