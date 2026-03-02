import { useState, useEffect, useCallback } from "react";
import { fetchPRs, fetchMilestones, fetchTimeline, createMilestone, deleteMilestone } from "../api/client";
import type { PRItem, MilestoneItem, TimelineEvent } from "../api/types";
import { formatDuration, formatRelativeDate } from "../utils/format";

function PRCard({ pr }: { pr: PRItem }) {
  if (!pr.activity_id) {
    return (
      <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 opacity-50">
        <p className="text-sm font-medium text-gray-500">{pr.distance_name}</p>
        <p className="text-xs text-gray-400 mt-1">No qualifying activity yet</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{pr.distance_name}</p>
      <p className="text-xl font-bold text-emerald-400 mt-1">{formatDuration(pr.moving_time!)}</p>
      <p className="text-xs text-gray-500 mt-1 truncate">{pr.activity_name}</p>
      {pr.start_date && <p className="text-xs text-gray-400">{formatRelativeDate(pr.start_date)}</p>}
    </div>
  );
}

function MilestoneForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await createMilestone({ title: title.trim(), achieved_at: date || null });
      setTitle("");
      setDate("");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New milestone..."
        className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="px-3 py-1.5 text-sm rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
      />
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition-colors"
      >
        Add
      </button>
    </form>
  );
}

export default function TrophyCase() {
  const [prs, setPrs] = useState<PRItem[]>([]);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([fetchPRs(), fetchMilestones(), fetchTimeline()])
      .then(([prData, msData, tlData]) => {
        setPrs(prData.prs);
        setMilestones(msData.milestones);
        setTimeline(tlData.events);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (id: number) => {
    await deleteMilestone(id);
    loadData();
  };

  if (loading) return <p className="text-center text-gray-500 py-8">Loading trophies...</p>;

  return (
    <div className="space-y-8">
      {/* PRs */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Personal Records</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {prs.map((pr) => <PRCard key={pr.distance_name} pr={pr} />)}
        </div>
      </section>

      {/* Milestones */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Milestones</h2>
        <MilestoneForm onCreated={loadData} />
        <div className="mt-4 space-y-2">
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{m.title}</p>
                {m.achieved_at && <p className="text-xs text-gray-500">{m.achieved_at}</p>}
              </div>
              <button onClick={() => handleDelete(m.id)} className="text-xs text-gray-400 hover:text-red-400 transition-colors">Remove</button>
            </div>
          ))}
          {milestones.length === 0 && <p className="text-sm text-gray-500">No milestones yet. Add one above!</p>}
        </div>
      </section>

      {/* Timeline */}
      {timeline.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Achievement Timeline</h2>
          <div className="space-y-3">
            {timeline.map((e, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${e.type === "pr" ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"}`}>
                  {e.type === "pr" ? "🏆" : "⭐"}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{e.title}</p>
                  {e.subtitle && <p className="text-xs text-gray-500">{e.subtitle}</p>}
                  {e.date && <p className="text-xs text-gray-400">{formatRelativeDate(e.date)}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
