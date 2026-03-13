import { lazy, Suspense, useState, useEffect } from "react";
import { useTheme } from "./hooks/useTheme";
import Header from "./components/Header";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";

const DashboardView = lazy(() => import("./views/DashboardView"));
const InsightsView = lazy(() => import("./views/InsightsView"));
const GearView = lazy(() => import("./views/GearView"));
const TrophyView = lazy(() => import("./views/TrophyView"));
const LandingView = lazy(() => import("./views/LandingView"));

type View = "landing" | "app";
type Tab = "dashboard" | "insights" | "gear" | "trophies";

const TABS: { value: Tab; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "insights", label: "Insights" },
  { value: "gear", label: "Gear" },
  { value: "trophies", label: "Trophies" },
];

function TabSpinner() {
  return (
    <div className="py-16 text-center">
      <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [view, setView] = useState<View>("landing");
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

  // Landing view: full-bleed, no header/tabs
  if (view === "landing") {
    return (
      <div className="min-h-screen bg-black text-gray-100">
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <LandingView
              firstName={firstName}
              onEnterApp={() => setView("app")}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100">
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        firstName={firstName}
        onLogoClick={() => setView("landing")}
      />

      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.value
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            {tab === "dashboard" && <DashboardView />}
            {tab === "insights" && <InsightsView />}
            {tab === "gear" && <GearView />}
            {tab === "trophies" && <TrophyView />}
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </div>
  );
}
