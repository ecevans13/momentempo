import { useState } from "react";
import { triggerSync } from "../api/client";

interface HeaderProps {
  theme: "dark" | "light";
  toggleTheme: () => void;
  firstName: string | null;
  onLogoClick?: () => void;
}

export default function Header({ theme, toggleTheme, firstName, onLogoClick }: HeaderProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await triggerSync();
      if (res.status === "accepted") {
        setSyncMsg("Sync started");
      } else {
        setSyncMsg(res.reason ?? "Sync skipped");
      }
    } catch {
      setSyncMsg("Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 3000);
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800/50 bg-white dark:bg-black">
      <button
        onClick={onLogoClick}
        className="text-xl font-bold tracking-tight text-gray-900 dark:text-white hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
      >
        {firstName ? `${firstName}'s Journey` : "Your Journey"}
      </button>
      <div className="flex items-center gap-3">
        {syncMsg && (
          <span className="text-sm text-gray-400">{syncMsg}</span>
        )}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
        >
          {syncing ? "Syncing..." : "Sync"}
        </button>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
