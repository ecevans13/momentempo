import { useCoachAdvice } from "../hooks/useInsights";

function renderAdvice(text: string) {
  // Split into blocks and render paragraphs, headers, and bullet lists
  const blocks = text.split("\n\n");
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Heading (## or ###)
    if (trimmed.startsWith("##")) {
      const heading = trimmed.replace(/^#+\s*/, "");
      return (
        <h3 key={i} className="text-sm font-semibold text-gray-900 dark:text-white mt-3 mb-1">
          {heading}
        </h3>
      );
    }

    // Bullet list block
    const lines = trimmed.split("\n");
    if (lines.every((l) => /^[-*]\s/.test(l.trim()) || l.trim() === "")) {
      return (
        <ul key={i} className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          {lines.filter((l) => l.trim()).map((line, j) => (
            <li key={j}>{renderInline(line.replace(/^[-*]\s+/, ""))}</li>
          ))}
        </ul>
      );
    }

    // Numbered list block
    if (lines.every((l) => /^\d+[.)]\s/.test(l.trim()) || l.trim() === "")) {
      return (
        <ol key={i} className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
          {lines.filter((l) => l.trim()).map((line, j) => (
            <li key={j}>{renderInline(line.replace(/^\d+[.)]\s+/, ""))}</li>
          ))}
        </ol>
      );
    }

    // Regular paragraph
    return (
      <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  // Handle **bold** inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

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
          <div className="space-y-2">{renderAdvice(data.advice)}</div>
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
