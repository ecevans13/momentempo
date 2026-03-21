import TrophyCase from "../components/TrophyCase";
import ErrorBoundary from "../components/ErrorBoundary";

export default function TrophyView() {
  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-display mb-6">Trophy Case</h1>
      <ErrorBoundary>
        <TrophyCase />
      </ErrorBoundary>
    </>
  );
}
