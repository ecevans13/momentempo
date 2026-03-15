import type { LifetimeStats } from "../api/types";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatDurationWithSeconds,
} from "../utils/format";

/* ---------- Separator icons (inline SVGs) ---------- */

function ShoeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0">
      <path d="M4 16.5V18h16v-1.5c0-1.1-.4-2.1-1.1-2.9L16 10.5l-1.5 1.5-3-3L8 12.5 5.1 13.6C4.4 14.4 4 15.4 4 16.5z" />
    </svg>
  );
}

function DumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0">
      <path d="M6.5 6a1.5 1.5 0 0 0-1.5 1.5v2H3.5A1.5 1.5 0 0 0 2 11v2a1.5 1.5 0 0 0 1.5 1.5H5v2A1.5 1.5 0 0 0 6.5 18h1A1.5 1.5 0 0 0 9 16.5v-9A1.5 1.5 0 0 0 7.5 6h-1zM16.5 6A1.5 1.5 0 0 0 15 7.5v9a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-2h1.5A1.5 1.5 0 0 0 22 13v-2a1.5 1.5 0 0 0-1.5-1.5H19v-2A1.5 1.5 0 0 0 17.5 6h-1zM9 11h6v2H9v-2z" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0">
      <path d="M12 2c-1 4-4 6-4 10a4 4 0 0 0 8 0c0-4-3-6-4-10z" />
    </svg>
  );
}

function MountainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0">
      <path d="M12 4l-8 16h16L12 4zm0 4.5L16.5 18h-9L12 8.5z" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0">
      <path d="M7 4V2h10v2h3v4c0 1.7-1.3 3-3 3h-.7c-.7 1.8-2.2 3.1-4.3 3.5V17h3v2H9v-2h3v-2.5c-2.1-.4-3.6-1.7-4.3-3.5H7c-1.7 0-3-1.3-3-3V4h3zm-1 4c0 .6.4 1 1 1h.3C7.1 8.4 7 7.7 7 7V6H6v2zm12 0V6h-1v1c0 .7-.1 1.4-.3 2H17c.6 0 1-.4 1-1z" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 sm:w-8 sm:h-8 shrink-0">
      <path d="M13 2L4 14h7v8l9-12h-7V2z" />
    </svg>
  );
}

const SEPARATOR_ICONS = [ShoeIcon, DumbbellIcon, FlameIcon, MountainIcon, TrophyIcon, BoltIcon];

/* ---------- Component ---------- */

interface StatsMarqueeProps {
  stats: LifetimeStats;
}

interface MarqueeItem {
  value: string;
  label: string;
}

function buildRows(stats: LifetimeStats): MarqueeItem[][] {
  const row1: MarqueeItem[] = [
    { value: formatDistance(stats.total_distance_m), label: "Total Distance" },
    { value: stats.total_activities.toLocaleString(), label: "Activities" },
    { value: formatElevation(stats.total_elevation_gain_m), label: "Climbed" },
  ];

  const row2: MarqueeItem[] = [
    { value: stats.total_runs.toLocaleString(), label: "Runs" },
    { value: stats.total_kudos.toLocaleString(), label: "Kudos" },
    { value: formatDuration(stats.total_moving_time_s), label: "Moving" },
  ];

  const row3: MarqueeItem[] = [
    { value: stats.total_prs.toLocaleString(), label: "PRs" },
    ...(stats.fastest_5k_s
      ? [{ value: formatDurationWithSeconds(stats.fastest_5k_s), label: "5K" }]
      : []),
    { value: stats.distinct_sport_types.toLocaleString(), label: "Sports" },
  ];

  return [row1, row2, row3];
}

function MarqueeRow({
  items,
  direction,
  speed = 30,
}: {
  items: MarqueeItem[];
  direction: "left" | "right";
  speed?: number;
}) {
  // Render items with separator icons between them
  const renderSet = (keyPrefix: string) =>
    items.map((item, i) => {
      const Icon = SEPARATOR_ICONS[i % SEPARATOR_ICONS.length];
      return (
        <span key={`${keyPrefix}-${i}`} className="inline-flex items-center gap-4 sm:gap-6">
          <span className="text-indigo-500/30">
            <Icon />
          </span>
          <span className="whitespace-nowrap">
            <span className="text-white/80">{item.value}</span>
            <span className="text-gray-500 ml-2 text-lg sm:text-2xl lg:text-3xl font-semibold uppercase tracking-widest">
              {item.label}
            </span>
          </span>
        </span>
      );
    });

  const animationName = direction === "left" ? "marquee-left" : "marquee-right";

  return (
    <div className="overflow-hidden border-b border-white/5 py-4 sm:py-5">
      <div
        className="inline-flex items-center gap-6 sm:gap-10 text-3xl sm:text-5xl lg:text-6xl font-black"
        style={{
          animationName,
          animationDuration: `${speed}s`,
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          whiteSpace: "nowrap",
          width: "max-content",
        }}
      >
        {/* Two copies for seamless loop */}
        {renderSet("a")}
        {renderSet("b")}
      </div>
    </div>
  );
}

export default function StatsMarquee({ stats }: StatsMarqueeProps) {
  const rows = buildRows(stats);

  return (
    <section className="bg-black py-6 sm:py-10 select-none">
      <MarqueeRow items={rows[0]} direction="left" speed={35} />
      <MarqueeRow items={rows[1]} direction="right" speed={28} />
      <MarqueeRow items={rows[2]} direction="left" speed={32} />
    </section>
  );
}
