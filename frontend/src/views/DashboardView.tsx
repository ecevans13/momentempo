import { useState } from "react";
import MetricCards from "../components/MetricCards";
import TrendChart from "../components/TrendChart";
import BestEffortsTimeline from "../components/BestEffortsTimeline";
import ActivityFeed from "../components/ActivityFeed";
import ActivityDetail from "../components/ActivityDetail";
import ErrorBoundary from "../components/ErrorBoundary";
import SportFilter from "../components/SportFilter";

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
    <>
      <div className="flex items-center justify-end mb-2">
        <SportFilter value={sportType} onChange={setSportType} />
      </div>
      <ErrorBoundary><MetricCards /></ErrorBoundary>
      <ErrorBoundary><TrendChart sportType={sportOrUndefined} /></ErrorBoundary>
      <ErrorBoundary><BestEffortsTimeline /></ErrorBoundary>
      <ErrorBoundary>
        <ActivityFeed sportType={sportOrUndefined} onSelectActivity={setSelectedActivityId} />
      </ErrorBoundary>
    </>
  );
}
