import { useRef, useEffect } from "react";
import gsap from "gsap";
import type { LifetimeStats } from "../api/types";
import { formatDistance, formatDuration, formatElevation } from "../utils/format";
import FloatingBrands from "./FloatingBrands";

interface HeroSectionProps {
  firstName: string | null;
  stats: LifetimeStats;
}

export default function HeroSection({ firstName, stats }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.from("[data-hero-item]", {
        y: 30,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const statItems = [
    { label: "Activities", value: stats.total_activities.toLocaleString() },
    { label: "Distance", value: formatDistance(stats.total_distance_m) },
    { label: "Time", value: formatDuration(stats.total_moving_time_s) },
    { label: "Elevation", value: formatElevation(stats.total_elevation_gain_m) },
  ];

  return (
    <section
      ref={containerRef}
      className="relative h-screen flex flex-col items-center justify-center bg-black px-6"
    >
      <FloatingBrands />

      <h1
        data-hero-item
        className="relative z-10 text-5xl sm:text-7xl font-bold tracking-tight text-white text-center font-display"
      >
        {firstName ? `${firstName}'s Journey` : "Your Journey"}
      </h1>

      <div
        data-hero-item
        className="relative z-10 mt-10 flex flex-wrap justify-center gap-8 sm:gap-12"
      >
        {statItems.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-indigo-400">
              {s.value}
            </div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Scroll indicator */}
      <div
        data-hero-item
        className="absolute bottom-8 flex flex-col items-center gap-2 text-gray-500"
      >
        <span className="text-xs tracking-widest uppercase">Scroll</span>
        <svg
          className="w-5 h-5 animate-bounce"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </div>
    </section>
  );
}
