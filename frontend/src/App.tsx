import { useState, useEffect } from "react";
import { useTheme } from "./hooks/useTheme";
import Header from "./components/Header";
import Layout from "./components/Layout";
import MetricCards from "./components/MetricCards";
import TrendChart from "./components/TrendChart";
import ActivityFeed from "./components/ActivityFeed";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [firstName, setFirstName] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100">
      <Header theme={theme} toggleTheme={toggleTheme} firstName={firstName} />
      <Layout>
        <MetricCards />
        <TrendChart />
        <ActivityFeed />
      </Layout>
    </div>
  );
}
