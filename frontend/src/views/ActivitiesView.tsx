import { useState } from "react";
import ActivityFeed from "../components/ActivityFeed";
import ActivityDetail from "../components/ActivityDetail";
import ErrorBoundary from "../components/ErrorBoundary";
import SportFilter from "../components/SportFilter";

export default function ActivitiesView() {
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-display">Activities</h1>
        <SportFilter value={sportType} onChange={setSportType} />
      </div>
      <ErrorBoundary>
        <ActivityFeed sportType={sportOrUndefined} onSelectActivity={setSelectedActivityId} />
      </ErrorBoundary>
    </>
  );
}
