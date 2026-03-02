import { useWhatsWorking } from "../hooks/useInsights";

export default function WhatsWorking() {
  const { data, loading, error } = useWhatsWorking();

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="inline-block w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400 text-sm">{error}</p>;
  }

  if (!data || data.insufficient_data) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-500">Not enough data for analysis yet.</p>
        <p className="text-xs text-gray-400 mt-1">
          Log at least 10 runs over several weeks to see training insights.
        </p>
      </div>
    );
  }

  if (data.insights.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-500">No strong patterns found in your recent training.</p>
        <p className="text-xs text-gray-400 mt-1">
          Based on {data.weeks_analyzed} weeks of data. Keep training consistently for more insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.insights.map((insight) => {
        const isPositive = insight.correlation < 0; // Negative correlation = faster pace = positive
        return (
          <div
            key={insight.type}
            className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 flex gap-3"
          >
            <div className="flex-shrink-0 mt-0.5">
              <span className={`text-lg ${isPositive ? "text-green-500" : "text-red-500"}`}>
                {isPositive ? "\u2191" : "\u2193"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{insight.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{insight.description}</p>
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                Based on {insight.data_points} weeks of data
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
