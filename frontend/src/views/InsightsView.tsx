import { useState } from "react";
import ErrorBoundary from "../components/ErrorBoundary";
import BestEffortsTimeline from "../components/BestEffortsTimeline";
import RacePredictor from "../components/RacePredictor";
import ActivityDetail from "../components/ActivityDetail";

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

type DateRange = "3m" | "6m" | "1y" | "all";

const DATE_RANGES: { value: DateRange; label: string }[] = [
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
];

function getDateCutoff(range: DateRange): string | undefined {
  if (range === "all") return undefined;
  const now = new Date();
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  now.setMonth(now.getMonth() - months);
  return now.toISOString().slice(0, 10);
}

export default function InsightsView() {
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("all");

  if (selectedActivityId !== null) {
    return (
      <ErrorBoundary>
        <ActivityDetail
          activityId={selectedActivityId}
          onBack={() => setSelectedActivityId(null)}
        />
      </ErrorBoundary>
    );
  }

  const dateCutoff = getDateCutoff(dateRange);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-display">Insights</h1>

      <ErrorBoundary>
        <Section
          title="Best Efforts Progression"
          actions={
            <div className="flex gap-1">
              {DATE_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setDateRange(r.value)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    dateRange === r.value
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        >
          <BestEffortsTimeline dateCutoff={dateCutoff} />
        </Section>
      </ErrorBoundary>

      <ErrorBoundary>
        <Section title="Race Predictor">
          <RacePredictor />
        </Section>
      </ErrorBoundary>
    </div>
  );
}
