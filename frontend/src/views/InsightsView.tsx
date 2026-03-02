import ErrorBoundary from "../components/ErrorBoundary";
import TrainingHeatmap from "../components/TrainingHeatmap";
import RacePredictor from "../components/RacePredictor";
import WhatsWorking from "../components/WhatsWorking";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function InsightsView() {
  return (
    <div className="space-y-6">
      <ErrorBoundary>
        <Section title="Training Heatmap">
          <TrainingHeatmap />
        </Section>
      </ErrorBoundary>

      <ErrorBoundary>
        <Section title="Race Predictor">
          <RacePredictor />
        </Section>
      </ErrorBoundary>

      <ErrorBoundary>
        <Section title="What's Working">
          <WhatsWorking />
        </Section>
      </ErrorBoundary>
    </div>
  );
}
