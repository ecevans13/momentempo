import { useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useFitness } from "../hooks/useInsights";

const TIMEFRAMES = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
];

export default function FitnessChart() {
  const [months, setMonths] = useState(6);
  const [lthrInput, setLthrInput] = useState("");
  const lthr = lthrInput ? parseInt(lthrInput, 10) : undefined;
  const { data, loading, error } = useFitness(months, lthr && lthr >= 100 ? lthr : undefined);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-400 py-4">{error}</p>;
  }

  if (!data || data.data.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4">
        No heart rate data available. Activities with HR data are needed for fitness modeling.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-200 dark:bg-gray-800 rounded-lg p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.months}
              onClick={() => setMonths(tf.months)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                months === tf.months
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">LTHR:</label>
          <input
            type="number"
            value={lthrInput}
            onChange={(e) => setLthrInput(e.target.value)}
            placeholder={data.lthr_used ? String(data.lthr_used) : "auto"}
            className="w-16 px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          {data.lthr_source && (
            <span className="text-xs text-gray-400">
              ({data.lthr_source === "auto" ? `auto: ${data.lthr_used} bpm` : "custom"})
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data.data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            tickFormatter={(d: string) => {
              const date = new Date(d + "T00:00:00");
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} width={40} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "0.5rem",
              fontSize: 12,
            }}
            labelFormatter={(d: string) => new Date(d + "T00:00:00").toLocaleDateString()}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                ctl: "Fitness (CTL)",
                atl: "Fatigue (ATL)",
                tsb: "Freshness (TSB)",
              };
              return [value.toFixed(1), labels[name] || name];
            }}
          />
          <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="ctl" stroke="#6366F1" strokeWidth={2} dot={false} name="ctl" />
          <Line type="monotone" dataKey="atl" stroke="#F43F5E" strokeWidth={2} dot={false} name="atl" />
          <Area
            type="monotone"
            dataKey="tsb"
            fill="#14B8A6"
            fillOpacity={0.1}
            stroke="#14B8A6"
            strokeWidth={2}
            dot={false}
            name="tsb"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex justify-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-indigo-500 inline-block" /> Fitness (CTL)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-rose-500 inline-block" /> Fatigue (ATL)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-teal-500 inline-block" /> Freshness (TSB)
        </span>
      </div>
    </div>
  );
}
