import { useState } from "react";
import GearGallery from "../components/GearGallery";
import ActivityDetail from "../components/ActivityDetail";
import ErrorBoundary from "../components/ErrorBoundary";

export default function GearView() {
  const [activityId, setActivityId] = useState<number | null>(null);

  if (activityId !== null) {
    return (
      <ErrorBoundary>
        <ActivityDetail
          activityId={activityId}
          onBack={() => setActivityId(null)}
        />
      </ErrorBoundary>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-display mb-6">Gear</h1>
      <ErrorBoundary>
        <GearGallery onSelectActivity={setActivityId} />
      </ErrorBoundary>
    </>
  );
}
