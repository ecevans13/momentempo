import { useState } from "react";
import MetricCards from "../components/MetricCards";
import TrendChart from "../components/TrendChart";
import TrainingHeatmap from "../components/TrainingHeatmap";
import FitnessChart from "../components/FitnessChart";
import ActivityDetail from "../components/ActivityDetail";
import ErrorBoundary from "../components/ErrorBoundary";
import SportFilter from "../components/SportFilter";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function DashboardView() {
  const [sportType, setSportType] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  const sportOrUndefined = sportType || undefined;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-display">Dashboard</h1>
        <SportFilter value={sportType} onChange={setSportType} />
      </div>
      <ErrorBoundary><MetricCards /></ErrorBoundary>
      <ErrorBoundary><TrendChart sportType={sportOrUndefined} /></ErrorBoundary>
      <ErrorBoundary>
        <Section title="Training Heatmap">
          <TrainingHeatmap onSelectActivity={setSelectedActivityId} />
        </Section>
      </ErrorBoundary>
      <ErrorBoundary>
        <Section title="Fitness & Freshness">
          <FitnessChart />
        </Section>
      </ErrorBoundary>
    </div>
  );
}
