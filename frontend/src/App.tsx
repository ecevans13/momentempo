import { useState, useEffect } from "react";
import { useTheme } from "./hooks/useTheme";
import Header from "./components/Header";
import Layout from "./components/Layout";
import MetricCards from "./components/MetricCards";
import TrendChart from "./components/TrendChart";
import ActivityFeed from "./components/ActivityFeed";
import ActivityDetail from "./components/ActivityDetail";
import GearGallery from "./components/GearGallery";
import TrophyCase from "./components/TrophyCase";
import ErrorBoundary from "./components/ErrorBoundary";
import SportFilter from "./components/SportFilter";

type Tab = "dashboard" | "gear" | "trophies";

const TABS: { value: Tab; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "gear", label: "Gear" },
  { value: "trophies", label: "Trophies" },
];

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [sportType, setSportType] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [gearActivityId, setGearActivityId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.athlete_name) {
          setFirstName(data.athlete_name.split(" ")[0]);
        }
      })
      .catch(() => {});
  }, []);

  const sportOrUndefined = sportType || undefined;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100">
      <Header theme={theme} toggleTheme={toggleTheme} firstName={firstName} />

      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setSelectedActivityId(null); setGearActivityId(null); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.value
                  ? "border-orange-500 text-orange-600 dark:text-orange-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Layout>
        {tab === "dashboard" && selectedActivityId !== null ? (
          <ErrorBoundary>
            <ActivityDetail
              activityId={selectedActivityId}
              onBack={() => setSelectedActivityId(null)}
            />
          </ErrorBoundary>
        ) : tab === "dashboard" ? (
          <>
            <div className="flex items-center justify-end mb-2">
              <SportFilter value={sportType} onChange={setSportType} />
            </div>
            <ErrorBoundary><MetricCards /></ErrorBoundary>
            <ErrorBoundary><TrendChart sportType={sportOrUndefined} /></ErrorBoundary>
            <ErrorBoundary>
              <ActivityFeed sportType={sportOrUndefined} onSelectActivity={setSelectedActivityId} />
            </ErrorBoundary>
          </>
        ) : tab === "gear" && gearActivityId !== null ? (
          <ErrorBoundary>
            <ActivityDetail
              activityId={gearActivityId}
              onBack={() => setGearActivityId(null)}
            />
          </ErrorBoundary>
        ) : tab === "gear" ? (
          <ErrorBoundary><GearGallery onSelectActivity={setGearActivityId} /></ErrorBoundary>
        ) : (
          <ErrorBoundary><TrophyCase /></ErrorBoundary>
        )}
      </Layout>
    </div>
  );
}
