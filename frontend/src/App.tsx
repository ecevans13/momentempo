import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { useTheme } from "./hooks/useTheme";
import { triggerSync } from "./api/client";
import Header from "./components/Header";
import HamburgerMenu from "./components/HamburgerMenu";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";

const DashboardView = lazy(() => import("./views/DashboardView"));
const InsightsView = lazy(() => import("./views/InsightsView"));
const GearView = lazy(() => import("./views/GearView"));
const TrophyView = lazy(() => import("./views/TrophyView"));
const ActivitiesView = lazy(() => import("./views/ActivitiesView"));
const HealthView = lazy(() => import("./views/HealthView"));
const LandingView = lazy(() => import("./views/LandingView"));

type View = "landing" | "app";
type Tab = "dashboard" | "insights" | "gear" | "trophies" | "activities" | "health";

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
  const [appVisible, setAppVisible] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.athlete_name) {
          setFirstName(data.athlete_name.split(" ")[0]);
        }
      })
      .catch(() => {});

    // Auto-sync from Strava on app load so latest activities are always available
    triggerSync().catch(() => {});
  }, []);

  const handleEnterApp = useCallback((_selectedActivityId?: number) => {
    setView("app");
    // Fade in the app view
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAppVisible(true));
    });
    window.scrollTo(0, 0);
  }, []);

  const handleReturnToLanding = useCallback(() => {
    setAppVisible(false);
    setTimeout(() => {
      setView("landing");
      window.scrollTo(0, 0);
    }, 300);
  }, []);

  const handleLandingNavigate = useCallback((t: Tab) => {
    setTab(t);
    handleEnterApp();
  }, [handleEnterApp]);

  // Landing view: full-bleed, no header/tabs
  if (view === "landing") {
    return (
      <div className="min-h-screen bg-black text-gray-100">
        {/* Floating hamburger menu */}
        <div className="fixed top-4 left-4 z-50">
          <HamburgerMenu currentTab={tab} onNavigate={handleLandingNavigate} />
        </div>
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            <LandingView
              firstName={firstName}
              onEnterApp={handleEnterApp}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100 transition-opacity duration-300 ${appVisible ? "opacity-100" : "opacity-0"}`}>
      {/* Top bar with hamburger + header controls */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800/50 bg-white dark:bg-black sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <HamburgerMenu currentTab={tab} onNavigate={setTab} />
          <button
            onClick={handleReturnToLanding}
            className="text-xl font-bold tracking-tight text-gray-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            {firstName ? `${firstName}'s Journey` : "Your Journey"}
          </button>
        </div>
        <Header theme={theme} toggleTheme={toggleTheme} />
      </header>

      <Layout>
        <ErrorBoundary>
          <Suspense fallback={<TabSpinner />}>
            {tab === "dashboard" && <DashboardView />}
            {tab === "insights" && <InsightsView />}
            {tab === "gear" && <GearView />}
            {tab === "trophies" && <TrophyView />}
            {tab === "activities" && <ActivitiesView />}
            {tab === "health" && <HealthView />}
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </div>
  );
}
