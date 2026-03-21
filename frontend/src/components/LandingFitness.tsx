import { useRef, useEffect, useMemo } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useFitness } from "../hooks/useInsights";

gsap.registerPlugin(ScrollTrigger);

// Smooth daily data into monthly averages, trimming to the range with actual data
function smoothToMonthly(data: { date: string; ctl: number }[]): { date: string; label: string; ctl: number }[] {
  const byMonth = new Map<string, { sum: number; count: number; lastDate: string }>();

  for (const pt of data) {
    const month = pt.date.slice(0, 7); // "YYYY-MM"
    const entry = byMonth.get(month);
    if (entry) {
      entry.sum += pt.ctl;
      entry.count++;
      entry.lastDate = pt.date;
    } else {
      byMonth.set(month, { sum: pt.ctl, count: 1, lastDate: pt.date });
    }
  }

  const result: { date: string; label: string; ctl: number }[] = [];
  for (const [month, { sum, count, lastDate }] of byMonth) {
    const d = new Date(month + "-15");
    result.push({
      date: lastDate,
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      ctl: Math.round((sum / count) * 10) / 10,
    });
  }

  // Trim leading/trailing months where CTL is essentially zero (< 0.5)
  // Keep at least 1 zero month on each side for context
  let start = 0;
  while (start < result.length - 1 && result[start].ctl < 0.5 && result[start + 1].ctl < 0.5) {
    start++;
  }
  if (start > 0) start--; // keep 1 zero month before

  let end = result.length - 1;
  // Don't trim the end — always show through to the current month

  return result.slice(start, end + 1);
}

// Build SVG path from points
function buildPath(
  points: { ctl: number }[],
  width: number,
  height: number,
  padding: { top: number; bottom: number; left: number; right: number }
): { path: string; areaPath: string; maxCtl: number } {
  if (points.length === 0) return { path: "", areaPath: "", maxCtl: 0 };

  const maxCtl = Math.max(...points.map((p) => p.ctl), 1);
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const coords = points.map((p, i) => ({
    x: padding.left + (i / (points.length - 1)) * plotW,
    y: padding.top + plotH - (p.ctl / maxCtl) * plotH,
  }));

  // Smooth curve using cubic bezier
  let path = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
    const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
    path += ` C ${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
  }

  // Area path (closes to bottom)
  const baseY = padding.top + plotH;
  const areaPath = path + ` L ${coords[coords.length - 1].x},${baseY} L ${coords[0].x},${baseY} Z`;

  return { path, areaPath, maxCtl };
}

const SVG_W = 900;
const SVG_H = 400;
const PADDING = { top: 30, bottom: 55, left: 55, right: 30 };

export default function LandingFitness() {
  const { data, loading } = useFitness(120);
  const sectionRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);

  const chartData = useMemo(() => {
    if (!data || data.data.length === 0) return null;

    const monthly = smoothToMonthly(data.data);
    if (monthly.length < 2) return null;

    const { path, areaPath, maxCtl } = buildPath(monthly, SVG_W, SVG_H, PADDING);

    // Current fitness (latest CTL)
    const latest = data.data[data.data.length - 1];
    const currentFitness = Math.round(latest.ctl);

    // Fitness trend: compare last month avg to first month avg
    const firstMonth = monthly[0].ctl;
    const lastMonth = monthly[monthly.length - 1].ctl;
    const trendUp = lastMonth > firstMonth;

    // Endpoint coordinates for the animated dot
    const plotW = SVG_W - PADDING.left - PADDING.right;
    const plotH = SVG_H - PADDING.top - PADDING.bottom;
    const endX = PADDING.left + plotW; // last point
    const endY = PADDING.top + plotH - (monthly[monthly.length - 1].ctl / maxCtl) * plotH;

    return { monthly, path, areaPath, maxCtl, currentFitness, trendUp, endX, endY };
  }, [data]);

  useEffect(() => {
    if (!chartData || !sectionRef.current || !pathRef.current || !pinnedRef.current) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      gsap.set(pathRef.current, { strokeDashoffset: 0 });
      if (areaRef.current) gsap.set(areaRef.current, { opacity: 0.15 });
      if (glowRef.current) gsap.set(glowRef.current, { strokeDashoffset: 0 });
      if (dotRef.current) gsap.set(dotRef.current, { opacity: 1 });
      if (titleRef.current) gsap.set(titleRef.current, { opacity: 1, y: 0 });
      if (subtitleRef.current) gsap.set(subtitleRef.current, { opacity: 1, y: 0 });
      return;
    }

    const ctx = gsap.context(() => {
      const pathEl = pathRef.current!;
      const totalLength = pathEl.getTotalLength();

      // Initial state: fully hidden
      gsap.set(pathEl, {
        strokeDasharray: totalLength,
        strokeDashoffset: totalLength,
      });

      if (glowRef.current) {
        gsap.set(glowRef.current, {
          strokeDasharray: totalLength,
          strokeDashoffset: totalLength,
        });
      }

      if (areaRef.current) {
        gsap.set(areaRef.current, { opacity: 0 });
      }

      if (dotRef.current) {
        gsap.set(dotRef.current, { opacity: 0 });
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          pin: pinnedRef.current,
        },
      });

      // Draw the line progressively
      tl.to(pathEl, {
        strokeDashoffset: 0,
        duration: 2,
        ease: "none",
      }, 0);

      // Glow follows slightly behind
      if (glowRef.current) {
        tl.to(glowRef.current, {
          strokeDashoffset: 0,
          duration: 2,
          ease: "none",
        }, 0.05);
      }

      // Area fades in as line draws
      if (areaRef.current) {
        tl.to(areaRef.current, {
          opacity: 0.12,
          duration: 1.5,
        }, 0.3);
      }

      // Dot appears at the end of the line
      if (dotRef.current) {
        tl.to(dotRef.current, {
          opacity: 1,
          duration: 0.2,
        }, 1.8);
      }

      // Title fades in after line is complete
      tl.fromTo(
        titleRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.4 },
        2.1
      );

      tl.fromTo(
        subtitleRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.3 },
        2.3
      );

      // Hold for a beat
      tl.to({}, { duration: 0.5 });
    }, sectionRef);

    return () => ctx.revert();
  }, [chartData]);

  if (loading || !chartData) return null;

  const plotH = SVG_H - PADDING.top - PADDING.bottom;
  const plotW = SVG_W - PADDING.left - PADDING.right;

  // Y-axis tick values
  const yTicks = [0, Math.round(chartData.maxCtl / 2), Math.round(chartData.maxCtl)];

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
        <div className="flex flex-col items-center px-6 w-full max-w-5xl">
          {/* SVG Chart */}
          <div className="w-full flex justify-center">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="fitness-gradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#14b8a6" />
                </linearGradient>
                <linearGradient id="fitness-area-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Grid lines */}
              {yTicks.map((val) => {
                const y = PADDING.top + plotH - (val / chartData.maxCtl) * plotH;
                return (
                  <g key={val}>
                    <line
                      x1={PADDING.left}
                      y1={y}
                      x2={PADDING.left + plotW}
                      y2={y}
                      stroke="#374151"
                      strokeWidth={0.5}
                      strokeDasharray="4 4"
                    />
                    <text
                      x={PADDING.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize={12}
                      fill="#6b7280"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* X-axis labels */}
              {chartData.monthly.map((pt, i) => {
                if (chartData.monthly.length > 8 && i % 2 !== 0 && i !== chartData.monthly.length - 1) return null;
                const x = PADDING.left + (i / (chartData.monthly.length - 1)) * plotW;
                return (
                  <text
                    key={pt.date}
                    x={x}
                    y={SVG_H - 18}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#6b7280"
                  >
                    {pt.label}
                  </text>
                );
              })}

              {/* Area fill */}
              <path
                ref={areaRef}
                d={chartData.areaPath}
                fill="url(#fitness-area-gradient)"
                opacity={0}
              />

              {/* Glow line */}
              <path
                ref={glowRef}
                d={chartData.path}
                fill="none"
                stroke="url(#fitness-gradient)"
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.3}
                filter="url(#glow)"
              />

              {/* Main fitness line */}
              <path
                ref={pathRef}
                d={chartData.path}
                fill="none"
                stroke="url(#fitness-gradient)"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Endpoint dot */}
              <circle
                ref={dotRef}
                cx={chartData.endX}
                cy={chartData.endY}
                r={6}
                fill="#14b8a6"
                stroke="#0f172a"
                strokeWidth={2}
                opacity={0}
              />

              {/* Y-axis label */}
              <text
                x={14}
                y={PADDING.top + plotH / 2}
                textAnchor="middle"
                fontSize={12}
                fill="#6b7280"
                transform={`rotate(-90, 14, ${PADDING.top + plotH / 2})`}
              >
                Fitness (CTL)
              </text>
            </svg>
          </div>

          {/* Title reveal */}
          <h2
            ref={titleRef}
            className="mt-10 text-4xl sm:text-6xl font-bold text-white tracking-tight opacity-0 font-display"
          >
            Built Fitness{chartData.trendUp ? ", One Day at a Time" : ""}
          </h2>
          <p
            ref={subtitleRef}
            className="mt-4 text-gray-400 text-lg sm:text-xl opacity-0"
          >
            Current fitness level: <span className="text-indigo-400 font-semibold">{chartData.currentFitness}</span> CTL
          </p>
        </div>
      </div>
    </section>
  );
}
