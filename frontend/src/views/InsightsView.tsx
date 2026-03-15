import { useState } from "react";
import ErrorBoundary from "../components/ErrorBoundary";
import BestEffortsTimeline from "../components/BestEffortsTimeline";
import WeeklyReport from "../components/WeeklyReport";
import TrainingHeatmap from "../components/TrainingHeatmap";
import FitnessChart from "../components/FitnessChart";
import RacePredictor from "../components/RacePredictor";
import HealthImport from "../components/HealthImport";
import ActivityDetail from "../components/ActivityDetail";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function InsightsView() {
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

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
      <ErrorBoundary>
        <Section title="Best Efforts Progression">
          <BestEffortsTimeline />
        </Section>
      </ErrorBoundary>

      <ErrorBoundary>
        <Section title="Weekly Report">
          <WeeklyReport />
        </Section>
      </ErrorBoundary>

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

      <ErrorBoundary>
        <Section title="Race Predictor">
          <RacePredictor />
        </Section>
      </ErrorBoundary>

      <ErrorBoundary>
        <Section title="Health Data">
          <HealthImport />
        </Section>
      </ErrorBoundary>
    </div>
  );
}
