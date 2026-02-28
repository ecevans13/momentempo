import { useState, useEffect } from "react";
import { fetchGear } from "../api/client";
import type { GearItem } from "../api/types";
import { formatDistance } from "../utils/format";

export default function GearGallery() {
  const [gear, setGear] = useState<GearItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGear()
      .then((r) => setGear(r.gear))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-center text-gray-500 py-8">Loading gear...</p>;
  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (gear.length === 0) return <p className="text-center text-gray-500 py-8">No gear found. Sync activities with gear assigned in Strava.</p>;

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Gear Gallery</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {gear.map((g) => (
          <div key={g.id} className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
            <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-2xl mb-3">
              👟
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white truncate">{g.name}</h3>
            {(g.brand_name || g.model_name) && (
              <p className="text-xs text-gray-500 truncate">{[g.brand_name, g.model_name].filter(Boolean).join(" ")}</p>
            )}
            <div className="mt-3 flex gap-4 text-sm text-gray-600 dark:text-gray-300">
              <span>{formatDistance(g.distance)}</span>
              <span>{g.activity_count} activities</span>
            </div>
            {g.retired && <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-500">Retired</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
