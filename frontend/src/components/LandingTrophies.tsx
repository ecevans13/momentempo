import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { fetchPRs } from "../api/client";
import type { PRItem } from "../api/types";

gsap.registerPlugin(ScrollTrigger);

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(seconds: number, distanceM: number): string {
  const pacePerKm = (seconds / distanceM) * 1000;
  const m = Math.floor(pacePerKm / 60);
  const s = Math.round(pacePerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

// SVG medal component matching the indigo/teal theme
function Medal({ rank, size = 80 }: { rank: number; size?: number }) {
  // Gold / Silver / Bronze mapped to app theme colors
  const fills = [
    { outer: "#6366f1", inner: "#818cf8", ribbon: "#4f46e5", shine: "#a5b4fc" }, // 1st - indigo
    { outer: "#14b8a6", inner: "#2dd4bf", ribbon: "#0d9488", shine: "#5eead4" }, // 2nd - teal
    { outer: "#8b5cf6", inner: "#a78bfa", ribbon: "#7c3aed", shine: "#c4b5fd" }, // 3rd - purple
  ];
  const f = fills[Math.min(rank, 2)];

  return (
    <svg width={size} height={size + 20} viewBox="0 0 80 100" fill="none">
      {/* Ribbon */}
      <path d="M30 48 L20 90 L40 75 L60 90 L50 48" fill={f.ribbon} opacity={0.8} />
      {/* Medal circle - outer */}
      <circle cx={40} cy={40} r={34} fill={f.outer} />
      {/* Medal circle - inner */}
      <circle cx={40} cy={40} r={28} fill={f.inner} opacity={0.3} />
      {/* Shine highlight */}
      <ellipse cx={32} cy={30} rx={12} ry={8} fill={f.shine} opacity={0.25} transform="rotate(-20 32 30)" />
      {/* Star */}
      <path
        d="M40 22 L43.5 33 L55 33 L46 39.5 L49 51 L40 44 L31 51 L34 39.5 L25 33 L36.5 33 Z"
        fill="white"
        opacity={0.9}
      />
      {/* Border ring */}
      <circle cx={40} cy={40} r={34} stroke="white" strokeWidth={1.5} fill="none" opacity={0.3} />
    </svg>
  );
}

export default function LandingTrophies() {
  const [prs, setPrs] = useState<PRItem[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPRs()
      .then((r) => setPrs(r.prs.filter((p: PRItem) => p.moving_time !== null)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (prs.length === 0 || !sectionRef.current || !pinnedRef.current) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      if (titleRef.current) gsap.set(titleRef.current, { opacity: 1, y: 0 });
      const cards = cardsRef.current?.children;
      if (cards) Array.from(cards).forEach((c) => gsap.set(c, { opacity: 1, y: 0 }));
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          pin: pinnedRef.current,
        },
      });

      // Title fades in first
      tl.fromTo(
        titleRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.6 },
        0
      );

      // Cards stagger in
      const cards = cardsRef.current?.children;
      if (cards) {
        Array.from(cards).forEach((card, i) => {
          tl.fromTo(
            card,
            { opacity: 0, y: 60, scale: 0.9 },
            { opacity: 1, y: 0, scale: 1, duration: 0.5 },
            0.4 + i * 0.3
          );
        });
      }

      // Hold
      tl.to({}, { duration: 0.5 });
    }, sectionRef);

    return () => ctx.revert();
  }, [prs]);

  if (prs.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      className="relative bg-black"
      style={{ height: "250vh" }}
    >
      <div
        ref={pinnedRef}
        className="h-screen w-full flex items-center justify-center"
      >
        <div className="flex flex-col items-center px-6 max-w-5xl w-full">
          <h2
            ref={titleRef}
            className="text-4xl sm:text-6xl font-bold text-white tracking-tight mb-12 opacity-0"
          >
            Personal Records
          </h2>

          <div
            ref={cardsRef}
            className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full"
          >
            {prs.map((pr, i) => (
              <div
                key={pr.distance_name}
                className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8 opacity-0"
              >
                <Medal rank={i} size={72} />
                <h3 className="mt-4 text-xl font-bold text-white">
                  {pr.distance_name}
                </h3>
                <p className="mt-2 text-3xl font-mono font-bold text-indigo-400">
                  {formatTime(pr.moving_time!)}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {formatPace(pr.moving_time!, pr.distance_target_m)}
                </p>
                <p className="mt-3 text-xs text-gray-600 text-center truncate max-w-full">
                  {pr.activity_name}
                </p>
                {pr.start_date && (
                  <p className="text-xs text-gray-700">
                    {new Date(pr.start_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
