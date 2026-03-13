import { useState, useCallback } from "react";
import HeroSection from "../components/HeroSection";
import ActivityProcession from "../components/ActivityProcession";
import { useLandingData } from "../hooks/useLanding";

interface LandingViewProps {
  firstName: string | null;
  onEnterApp: (selectedActivityId?: number) => void;
}

export default function LandingView({ firstName, onEnterApp }: LandingViewProps) {
  const { data, loading, error } = useLandingData();
  const [transitioning, setTransitioning] = useState(false);

  const handleTransition = useCallback((activityId?: number) => {
    setTransitioning(true);
    // Let the fade animation play, then switch view
    setTimeout(() => onEnterApp(activityId), 500);
  }, [onEnterApp]);

  // Error: skip to dashboard
  if (error && !transitioning) {
    onEnterApp();
    return null;
  }

  // Loading state
  if (loading || !data) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        {/* Skeleton card */}
        <div className="w-80 rounded-2xl border border-white/5 overflow-hidden">
          <div className="h-72 bg-gray-900 animate-pulse relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.5s_infinite]" />
          </div>
          <div className="p-3 bg-black/40 space-y-2">
            <div className="h-4 bg-gray-800 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-gray-800 rounded animate-pulse w-1/2" />
          </div>
        </div>
        <p className="text-gray-600 text-sm">Loading your journey...</p>
      </div>
    );
  }

  // Too few activities: skip procession
  if (data.recent_activities.length < 3) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h1>
        <p className="text-gray-400 mb-8 max-w-md">
          Sync your Strava activities to see them come to life in an immersive scroll experience.
        </p>
        <button
          onClick={() => handleTransition()}
          className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div
      className={`bg-black transition-opacity duration-500 ${transitioning ? "opacity-0" : "opacity-100"}`}
    >
      <HeroSection firstName={firstName} stats={data.lifetime_stats} />
      <ActivityProcession
        activities={data.recent_activities}
        onViewAll={() => handleTransition()}
        onSelectActivity={(id) => handleTransition(id)}
      />
    </div>
  );
}
