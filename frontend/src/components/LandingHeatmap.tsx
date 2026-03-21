import { useRef, useEffect, useMemo } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useHeatmap } from "../hooks/useInsights";

gsap.registerPlugin(ScrollTrigger);

const CELL_SIZE = 18;
const CELL_GAP = 4;
const COLS = 53; // weeks
const ROWS = 7;  // days

const COLORS = [
  "#1f2937", // gray-800 (no activity — dark bg)
  "#134e4a", // teal-900
  "#0f766e", // teal-700
  "#0d9488", // teal-600
  "#14b8a6", // teal-500
];

function getColor(load: number, maxLoad: number): string {
  if (load === 0) return COLORS[0];
  const level = Math.min(4, Math.ceil((load / maxLoad) * 4));
  return COLORS[level];
}

// Seeded shuffle for deterministic random order
function shuffleArray<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function LandingHeatmap() {
  const { data, loading } = useHeatmap(12);
  const sectionRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  // Build grid data
  const gridData = useMemo(() => {
    if (!data) return null;

    const dayMap = new Map(data.days.map((d) => [d.date, d.load]));
    const maxLoad = data.max_load || 1;

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 52 * 7 - startDate.getDay() + 1);

    const cells: { date: string; load: number; col: number; row: number; color: string }[] = [];
    let weekIdx = 0;
    let prevDow = -1;

    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const dow = (d.getDay() + 6) % 7; // Monday=0

      if (dow === 0 && prevDow >= 0) weekIdx++;
      prevDow = dow;

      const load = dayMap.get(key) ?? 0;
      cells.push({
        date: key,
        load,
        col: weekIdx,
        row: dow,
        color: getColor(load, maxLoad),
      });
    }

    // Count active days and compute streaks
    const activeDates = data.days.map((d) => d.date);
    const activeDays = activeDates.length;
    let longestStreak = 0;
    let currentStreak = 0;
    if (activeDates.length > 0) {
      const dateSet = new Set(activeDates);
      const sorted = [...activeDates].sort();
      const start = new Date(sorted[0]);
      const end = new Date(sorted[sorted.length - 1]);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        if (dateSet.has(key)) {
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }
    }

    // Random reveal order (seeded for consistency)
    const revealOrder = shuffleArray(
      cells.map((_, i) => i),
      42
    );

    return { cells, revealOrder, activeDays, longestStreak };
  }, [data]);

  useEffect(() => {
    if (!gridData || !sectionRef.current || !svgRef.current || !pinnedRef.current) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      const rects = svgRef.current.querySelectorAll("rect[data-cell]");
      rects.forEach((r) => gsap.set(r, { opacity: 1 }));
      if (titleRef.current) gsap.set(titleRef.current, { opacity: 1, y: 0 });
      if (subtitleRef.current) gsap.set(subtitleRef.current, { opacity: 1, y: 0 });
      if (statsRef.current) gsap.set(statsRef.current, { opacity: 1, y: 0 });
      return;
    }

    const ctx = gsap.context(() => {
      const rects = svgRef.current!.querySelectorAll("rect[data-cell]");
      const totalCells = rects.length;
      if (totalCells === 0) return;

      const orderedRects = gridData.revealOrder.map((i) => rects[i]).filter(Boolean);

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          pin: pinnedRef.current,
        },
      });

      // Reveal cells in random order — batch them for performance
      const batchSize = Math.max(1, Math.ceil(orderedRects.length / 80));
      for (let i = 0; i < orderedRects.length; i += batchSize) {
        const batch = orderedRects.slice(i, i + batchSize);
        tl.to(batch, {
          opacity: 1,
          duration: 0.02,
          stagger: 0,
        }, (i / orderedRects.length) * 2);
      }

      // Title and subtitle fade in after cells are mostly filled
      tl.fromTo(
        titleRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.4 },
        2.0
      );
      tl.fromTo(
        subtitleRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3 },
        2.2
      );
      tl.fromTo(
        statsRef.current,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.3 },
        2.3
      );

      // Hold for a beat so the user can read it
      tl.to({}, { duration: 0.5 });
    }, sectionRef);

    return () => ctx.revert();
  }, [gridData]);

  if (loading || !gridData) return null;

  const svgWidth = COLS * (CELL_SIZE + CELL_GAP);
  const svgHeight = ROWS * (CELL_SIZE + CELL_GAP);

  return (
    <section
      ref={sectionRef}
      className="relative bg-black"
      style={{ height: "300vh" }}
    >
      <div
        ref={pinnedRef}
        className="h-screen w-full flex items-center justify-center"
      >
        <div className="flex flex-col items-center px-6">
          {/* Heatmap grid */}
          <div className="overflow-x-auto flex justify-center">
            <svg
              ref={svgRef}
              width={svgWidth}
              height={svgHeight}
              className="block"
            >
              {gridData.cells.map((cell, i) => (
                <rect
                  key={cell.date}
                  data-cell={i}
                  x={cell.col * (CELL_SIZE + CELL_GAP)}
                  y={cell.row * (CELL_SIZE + CELL_GAP)}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={3}
                  fill={cell.color}
                  opacity={0}
                />
              ))}
            </svg>
          </div>

          {/* Title reveal */}
          <h2
            ref={titleRef}
            className="mt-12 text-4xl sm:text-6xl font-bold text-white tracking-tight opacity-0 font-display"
          >
            Consistency was Key
          </h2>
          <p
            ref={subtitleRef}
            className="mt-4 text-gray-400 text-lg sm:text-xl opacity-0"
          >
            {gridData.activeDays} days of training over the past year
          </p>
          <div
            ref={statsRef}
            className="mt-5 flex gap-8 text-base text-gray-500 opacity-0"
          >
            <span>
              <strong className="text-teal-400">{gridData.activeDays}</strong> active days
            </span>
            <span>
              <strong className="text-teal-400">{gridData.longestStreak}</strong> day longest streak
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
