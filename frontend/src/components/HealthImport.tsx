import { useState } from "react";
import { uploadHealthExport } from "../api/client";
import { useHealthSummary } from "../hooks/useInsights";
import type { HealthImportResponse } from "../api/types";

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

export default function HealthImport() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<HealthImportResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { data: summary, loading: summaryLoading, refresh } = useHealthSummary();

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
          {summary.metrics.map((m) => (
            <div
              key={m.metric_type}
              className="rounded-lg bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-3"
            >
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
                {METRIC_LABELS[m.metric_type] || m.metric_type}
              </p>
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                {m.latest_value.toFixed(m.unit === "bpm" || m.unit === "ms" ? 0 : 1)}
                <span className="text-xs font-normal text-gray-500 ml-1">{m.unit}</span>
              </p>
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
          ))}
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
