import { useCoachAdvice } from "../hooks/useInsights";

export default function TrainingCoach() {
  const { data, loading, error, fetch } = useCoachAdvice();

  return (
    <div className="space-y-4">
      {!data && !loading && !error && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 mb-3">
            Get personalized training advice based on your recent activities, fitness state, and health data.
          </p>
          <button
            onClick={fetch}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
          >
            Get Coaching Advice
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Analyzing your training...</span>
        </div>
      )}

      {error && (
        <div className="py-4">
          <p className="text-sm text-amber-500 mb-3">{error}</p>
          {!error.includes("not configured") && (
            <button
              onClick={fetch}
              className="text-sm text-indigo-500 hover:text-indigo-400"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {data && (
        <div className="space-y-3">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {data.advice.split("\n\n").map((paragraph, i) => (
              <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <span className="text-[10px] text-gray-400">
              Based on {data.weeks_analyzed} weeks of data
            </span>
            <button
              onClick={fetch}
              className="text-xs text-indigo-500 hover:text-indigo-400"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
