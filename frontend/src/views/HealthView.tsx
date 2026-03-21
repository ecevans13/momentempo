import HealthImport from "../components/HealthImport";
import ErrorBoundary from "../components/ErrorBoundary";

export default function HealthView() {
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-display mb-6">Health Data</h1>
      <ErrorBoundary>
        <HealthImport />
      </ErrorBoundary>
    </>
  );
}
