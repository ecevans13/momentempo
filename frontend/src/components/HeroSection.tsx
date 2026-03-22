import { useRef, useEffect } from "react";
import gsap from "gsap";
import FloatingBrands from "./FloatingBrands";
import Logo from "./Logo";
import type { LifetimeStats } from "../api/types";

interface HeroSectionProps {
  stats: LifetimeStats;
}

export default function HeroSection({ stats: _stats }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      containerRef.current.querySelectorAll("[data-hero-logo], [data-hero-subtitle], [data-hero-scroll]")
        .forEach((el) => ((el as HTMLElement).style.opacity = "1"));
      return;
    }

    const ctx = gsap.context(() => {
      gsap.from("[data-hero-logo]", {
        scale: 0.8,
        opacity: 0,
        y: -40,
        duration: 1.2,
        ease: "power3.out",
      });

      gsap.from("[data-hero-scroll]", {
        opacity: 0,
        duration: 0.6,
        delay: 1.0,
      });

      gsap.set("[data-hero-subtitle]", { y: 20 });
      gsap.to("[data-hero-subtitle]", {
        opacity: 1,
        y: 0,
        duration: 1,
        delay: 1.4,
        ease: "power2.out",
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative bg-black h-screen flex flex-col items-center justify-center px-6">
      <FloatingBrands />

      <div data-hero-logo className="relative z-10">
        <Logo className="h-28 sm:h-40 md:h-52 lg:h-60 w-auto" />
      </div>

      <p
        data-hero-subtitle
        className="relative z-10 text-gray-400 text-lg sm:text-xl md:text-2xl tracking-wide text-center max-w-2xl mt-8 opacity-0"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        Every mile logged. Every second earned. Your journey, quantified.
      </p>

      <div
        data-hero-scroll
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
