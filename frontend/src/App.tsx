import { useState, useEffect } from "react";
import { useTheme } from "./hooks/useTheme";
import Header from "./components/Header";
import Layout from "./components/Layout";
import MetricCards from "./components/MetricCards";
import TrendChart from "./components/TrendChart";
import ActivityFeed from "./components/ActivityFeed";
import ErrorBoundary from "./components/ErrorBoundary";
import SportFilter from "./components/SportFilter";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [sportType, setSportType] = useState("");

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
      <Layout>
        <div className="flex items-center justify-end mb-2">
          <SportFilter value={sportType} onChange={setSportType} />
        </div>
        <ErrorBoundary>
          <MetricCards />
        </ErrorBoundary>
        <ErrorBoundary>
          <TrendChart sportType={sportOrUndefined} />
        </ErrorBoundary>
        <ErrorBoundary>
          <ActivityFeed sportType={sportOrUndefined} />
        </ErrorBoundary>
      </Layout>
    </div>
  );
}
