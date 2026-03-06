import { useState } from "react";
import { uploadHealthExport } from "../api/client";
import { useHealthSummary, useHealthHistory } from "../hooks/useInsights";
import type { HealthImportResponse, HealthHistoryPoint } from "../api/types";

const METRIC_LABELS: Record<string, string> = {
  BodyMass: "Weight",
  BodyFatPercentage: "Body Fat",
  RestingHeartRate: "Resting HR",
  HRV: "HRV",
  VO2Max: "VO2 Max",
  ActiveEnergyBurned: "Active Cal",
  DietaryEnergyConsumed: "Diet Cal",
  DietaryProtein: "Protein",
};

const KG_TO_LBS = 2.20462;

function displayValue(metricType: string, value: number, unit: string): { value: string; unit: string } {
  if (metricType === "BodyMass" && unit === "kg") {
    return { value: (value * KG_TO_LBS).toFixed(1), unit: "lbs" };
  }
  const decimals = unit === "bpm" || unit === "ms" ? 0 : 1;
  return { value: value.toFixed(decimals), unit };
}

function MiniSparkline({ points, metricType, unit }: { points: HealthHistoryPoint[]; metricType: string; unit: string }) {
  if (points.length < 2) return null;

  const values = points.map((p) => {
    if (metricType === "BodyMass" && unit === "kg") return p.value * KG_TO_LBS;
    return p.value;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 80;
  const height = 24;
  const padding = 2;
  const usableH = height - padding * 2;
  const usableW = width - padding * 2;

  const pathPoints = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * usableW;
    const y = padding + usableH - ((v - min) / range) * usableH;
    return `${x},${y}`;
  });

  const d = `M${pathPoints.join("L")}`;
  const trend = values[values.length - 1] - values[0];
  const color = trend >= 0 ? "#10b981" : "#ef4444";

  return (
    <svg width={width} height={height} className="mt-1">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HealthImport() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<HealthImportResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { data: summary, loading: summaryLoading, refresh } = useHealthSummary();
  const { data: historyData, refresh: refreshHistory } = useHealthHistory();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setResult(null);
    try {
      const res = await uploadHealthExport(file);
      setResult(res);
      refresh();
      refreshHistory();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload section */}
      <div className="flex items-center gap-3">
        <label className="relative cursor-pointer">
          <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
            {uploading ? "Importing..." : "Import Apple Health Export"}
          </span>
          <input
            type="file"
            accept=".zip"
            onChange={handleUpload}
            disabled={uploading}
            className="sr-only"
          />
        </label>
        {uploading && (
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {result && (
        <p className="text-xs text-emerald-500">
          Imported {result.records_imported.toLocaleString()} records
          ({result.metric_types_found.join(", ")})
        </p>
      )}
      {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

      {/* Health summary cards */}
      {summary?.has_data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {summary.metrics.map((m) => {
            const display = displayValue(m.metric_type, m.latest_value, m.unit);
            const history = historyData?.history[m.metric_type];
            return (
              <div
                key={m.metric_type}
                className="rounded-lg bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-3"
              >
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
                  {METRIC_LABELS[m.metric_type] || m.metric_type}
                </p>
                <p className="text-base font-semibold text-gray-900 dark:text-white">
                  {display.value}
                  <span className="text-xs font-normal text-gray-500 ml-1">{display.unit}</span>
                </p>
                {history && history.length >= 2 && (
                  <MiniSparkline points={history} metricType={m.metric_type} unit={m.unit} />
                )}
                {m.trend_pct !== null && (
                  <p
                    className={`text-[10px] mt-0.5 ${
                      m.trend_pct > 0 ? "text-emerald-500" : m.trend_pct < 0 ? "text-red-500" : "text-gray-400"
                    }`}
                  >
                    {m.trend_pct > 0 ? "+" : ""}
                    {m.trend_pct.toFixed(1)}% trend
                  </p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">{m.latest_date}</p>
              </div>
            );
          })}
        </div>
      )}

      {!summaryLoading && !summary?.has_data && !result && (
        <p className="text-xs text-gray-500">
          No health data imported yet. Export from Apple Health app and upload the ZIP file.
        </p>
      )}
    </div>
  );
}
