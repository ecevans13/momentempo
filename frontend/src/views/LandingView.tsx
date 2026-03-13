import HeroSection from "../components/HeroSection";
import ActivityProcession from "../components/ActivityProcession";
import { useLandingData } from "../hooks/useLanding";

interface LandingViewProps {
  firstName: string | null;
  onEnterApp: () => void;
}

export default function LandingView({ firstName, onEnterApp }: LandingViewProps) {
  const { data, loading, error } = useLandingData();

  // Error: skip to dashboard
  if (error) {
    onEnterApp();
    return null;
  }

  // Loading state
  if (loading || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="space-y-4 w-64">
          <div className="h-8 bg-gray-800 rounded animate-pulse" />
          <div className="h-4 bg-gray-800 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-gray-800 rounded animate-pulse w-1/2" />
        </div>
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
          onClick={onEnterApp}
          className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="bg-black">
      <HeroSection firstName={firstName} stats={data.lifetime_stats} />
      <ActivityProcession
        activities={data.recent_activities}
        onViewAll={onEnterApp}
      />
    </div>
  );
}
