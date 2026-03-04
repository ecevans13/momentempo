import TrophyCase from "../components/TrophyCase";
import ErrorBoundary from "../components/ErrorBoundary";

export default function TrophyView() {
  return (
    <ErrorBoundary>
      <TrophyCase />
    </ErrorBoundary>
  );
}
