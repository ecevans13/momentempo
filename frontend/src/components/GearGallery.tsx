import { useState, useEffect } from "react";
import { fetchGear, fetchGearActivities } from "../api/client";
import type { GearItem, ActivityItem } from "../api/types";
import {
  formatDistance,
  formatDuration,
  formatRelativeDate,
  formatElevation,
  formatPace,
} from "../utils/format";

// Map gear model names (lowercased) to local images
const GEAR_IMAGES: [string, string][] = [
  ["cloudsurfer next", "/gear/cloudsurfer-next.png"],
  ["fuelcell rebel v5", "/gear/fuelcell-rebel-v5.png"],
  ["cloudmonster", "/gear/cloudmonster-max.png"],
];

function getGearImage(gear: GearItem): string | null {
  const model = (gear.model_name || "").toLowerCase();
  const name = (gear.nickname || gear.name || "").toLowerCase();
  for (const [key, img] of GEAR_IMAGES) {
    if (model.includes(key) || name.includes(key)) return img;
  }
  return null;
}

const SPORT_ICONS: Record<string, string> = {
  Run: "\u{1F3C3}",
  TrailRun: "\u26F0\uFE0F",
  VirtualRun: "\u{1F5A5}\uFE0F",
  Ride: "\u{1F6B4}",
  GravelRide: "\u{1F6B5}",
  VirtualRide: "\u{1F5A5}\uFE0F",
  Swim: "\u{1F3CA}",
  Hike: "\u{1F97E}",
  Walk: "\u{1F6B6}",
  Workout: "\u{1F4AA}",
};

interface GearGalleryProps {
  onSelectActivity?: (id: number) => void;
}

export default function GearGallery({ onSelectActivity }: GearGalleryProps) {
  const [gear, setGear] = useState<GearItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGearId, setSelectedGearId] = useState<string | null>(null);

  useEffect(() => {
    fetchGear()
      .then((r) => setGear(r.gear))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-center text-gray-500 py-8">Loading gear...</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (gear.length === 0) return <p className="text-center text-gray-500 py-8">No gear found. Sync activities with gear assigned in Strava.</p>;

  const selectedGear = selectedGearId ? gear.find((g) => g.id === selectedGearId) : null;

  if (selectedGear) {
    return (
      <GearDetail
        gear={selectedGear}
        onBack={() => setSelectedGearId(null)}
        onSelectActivity={onSelectActivity}
      />
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Gear Gallery</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {gear.map((g) => {
          const img = getGearImage(g);
          return (
          <button
            key={g.id}
            type="button"
            onClick={() => setSelectedGearId(g.id)}
            className="w-full text-left rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/10 dark:hover:shadow-indigo-500/20 hover:border-indigo-300/30 dark:hover:border-indigo-500/30 cursor-pointer"
          >
            {img ? (
              <div className="h-32 flex items-center justify-center mb-3">
                <img src={img} alt={g.name} className="max-h-full max-w-full object-contain" loading="lazy" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-2xl mb-3">
                {"\u{1F45F}"}
              </div>
            )}
            <h3 className="font-medium text-gray-900 dark:text-white truncate">{g.nickname || g.name}</h3>
            {(g.brand_name || g.model_name) && (
              <p className="text-xs text-gray-500 truncate">{[g.brand_name, g.model_name].filter(Boolean).join(" ")}</p>
            )}
            <div className="mt-3 flex gap-4 text-sm text-gray-600 dark:text-gray-300">
              <span>{formatDistance(g.distance)}</span>
              <span>{g.activity_count} activities</span>
            </div>
            {g.retired && <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-500">Retired</span>}
          </button>
          );
        })}
      </div>
    </section>
  );
}

function GearDetail({
  gear,
  onBack,
  onSelectActivity,
}: {
  gear: GearItem;
  onBack: () => void;
  onSelectActivity?: (id: number) => void;
}) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchGearActivities(gear.id)
      .then((r) => setActivities(r.activities))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [gear.id]);

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-3 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Gear
        </button>
        <div className="flex items-start gap-4">
          {(() => {
            const img = getGearImage(gear);
            return img ? (
              <div className="w-20 h-20 shrink-0 flex items-center justify-center">
                <img src={img} alt={gear.name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-lg bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-3xl shrink-0">
                {"\u{1F45F}"}
              </div>
            );
          })()}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{gear.nickname || gear.name}</h1>
            {(gear.brand_name || gear.model_name) && (
              <p className="text-sm text-gray-500">{[gear.brand_name, gear.model_name].filter(Boolean).join(" ")}</p>
            )}
          </div>
        </div>
      </div>

      {/* Gear stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Total Distance" value={formatDistance(gear.distance)} />
        <StatCard label="Activities" value={String(gear.activity_count)} />
        <StatCard label="Status" value={gear.retired ? "Retired" : "Active"} />
      </div>

      {/* Activities list */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Activities ({activities.length})
        </h2>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        {loading ? (
          <div className="py-8 text-center">
            <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500 mt-3">Loading activities...</p>
          </div>
        ) : activities.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">No activities found for this gear.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => {
              const isRun = ["Run", "TrailRun", "VirtualRun", "Treadmill"].includes(a.sport_type);
              const paceDisplay = isRun && a.distance > 0
                ? formatPace((a.moving_time / a.distance) * 1000)
                : null;
              const icon = SPORT_ICONS[a.sport_type] ?? "\u{1F3C5}";

              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onSelectActivity?.(a.id)}
                  className="w-full text-left flex items-start gap-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/10 dark:hover:shadow-indigo-500/20 hover:border-indigo-300/30 dark:hover:border-indigo-500/30 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.name}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        <span>{icon}</span>
                        {a.sport_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      {formatRelativeDate(a.start_date)}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                      {a.distance > 0 && <span>{formatDistance(a.distance)}</span>}
                      <span>{formatDuration(a.moving_time)}</span>
                      {paceDisplay && <span>{paceDisplay}</span>}
                      {a.total_elevation_gain > 0 && <span>{formatElevation(a.total_elevation_gain)}</span>}
                      {a.has_heartrate && a.average_heartrate && (
                        <span>{Math.round(a.average_heartrate)} bpm</span>
                      )}
                    </div>
                  </div>
                  {a.kudos_count > 0 && (
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {"\u{1F44D}"} {a.kudos_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
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
