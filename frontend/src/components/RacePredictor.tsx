import { useRacePredictions } from "../hooks/useInsights";
import { formatDuration } from "../utils/format";

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-red-500",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — large extrapolation",
};

export default function RacePredictor() {
  const { data, loading, error } = useRacePredictions();

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

  if (!data || data.anchor_efforts.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-500">No qualifying race efforts found.</p>
        <p className="text-xs text-gray-400 mt-1">
          Complete runs at standard distances (1mi, 5K, 10K, half, marathon) to see predictions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* VDOT badge */}
      {data.vdot_estimate && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">
            VDOT {data.vdot_estimate}
          </span>
          <span className="text-xs text-gray-500" title="Estimated VO2max-equivalent based on your best efforts">
            Estimated fitness level
          </span>
        </div>
      )}

      {/* Anchor PRs */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Based on your PRs
        </h3>
        <div className="flex flex-wrap gap-2">
          {data.anchor_efforts.map((a) => (
            <span
              key={a.distance_name}
              className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            >
              {a.distance_name}: {formatDuration(a.time_seconds)}
            </span>
          ))}
        </div>
      </div>

      {/* Prediction cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.predictions.map((p) => (
          <div
            key={p.distance_name}
            className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{p.distance_name}</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${CONFIDENCE_COLORS[p.confidence]}`}
                title={CONFIDENCE_LABELS[p.confidence]}
              />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatDuration(p.predicted_seconds)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Based on {p.based_on}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
