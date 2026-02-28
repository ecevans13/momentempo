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
    <ErrorBoundary>
      <GearGallery onSelectActivity={setActivityId} />
    </ErrorBoundary>
  );
}
