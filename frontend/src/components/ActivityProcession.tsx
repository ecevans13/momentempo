import { useRef, useEffect, createRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ActivityCard3D from "./ActivityCard3D";
import type { LandingActivity } from "../api/types";

gsap.registerPlugin(ScrollTrigger);

interface ActivityProcessionProps {
  activities: LandingActivity[];
  onViewAll: () => void;
}

export default function ActivityProcession({
  activities,
  onViewAll,
}: ActivityProcessionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(activities.map(() => createRef<HTMLDivElement>()));

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReduced) return;
    if (!sectionRef.current || !viewportRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 1,
          pin: viewportRef.current,
        },
      });

      // One continuous motion per card, no stops.
      // Next card enters when previous is ~40% through its journey.
      const flightDur = 3;   // total time each card travels from back to past viewer
      const stagger = 1.2;   // next card starts partway through previous card's flight

      // Alternating x positions (px offset from center)
      const xPositions = [-160, 160];

      cardRefs.current.forEach((ref, i) => {
        const el = ref.current;
        if (!el) return;

        const side = xPositions[i % 2];
        const offset = i * stagger;

        // Single continuous tween: far back → through center → past viewer
        tl.fromTo(
          el,
          {
            z: -2000,
            x: side,
            scale: 0.3,
            opacity: 0,
          },
          {
            z: 1400,
            x: side,
            scale: 2.5,
            opacity: 0,
            duration: flightDur,
            ease: "none",
            // Keyframe opacity: fade in as it approaches, fade out as it passes
            onUpdate: function () {
              const progress = this.progress();
              // 0..0.25: fade in, 0.25..0.65: fully visible, 0.65..1: fade out
              let alpha: number;
              if (progress < 0.2) {
                alpha = progress / 0.2;
              } else if (progress < 0.6) {
                alpha = 1;
              } else {
                alpha = 1 - (progress - 0.6) / 0.4;
              }
              gsap.set(el, { opacity: alpha });
            },
          },
          offset
        );
      });

      // CTA fade in after last card
      const lastOffset = (activities.length - 1) * stagger;
      if (ctaRef.current) {
        tl.fromTo(
          ctaRef.current,
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 1 },
          lastOffset + flightDur * 0.8
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, [activities, prefersReduced]);

  // Reduced motion: static alternating grid
  if (prefersReduced) {
    return (
      <section className="bg-black px-6 py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
          {activities.map((a) => (
            <div key={a.id} className="relative h-80">
              <ActivityCard3D activity={a} ref={null} />
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <button
            onClick={onViewAll}
            className="px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            View All Activities
          </button>
        </div>
      </section>
    );
  }

  const scrollHeight = Math.max(300, activities.length * 60 + 200);

  return (
    <section
      ref={sectionRef}
      className="relative bg-black"
      style={{ height: `${scrollHeight}vh` }}
    >
      <div
        ref={viewportRef}
        className="h-screen w-full overflow-hidden relative"
        style={{ perspective: "1200px" }}
      >
        {activities.map((activity, i) => (
          <ActivityCard3D
            key={activity.id}
            activity={activity}
            ref={cardRefs.current[i]}
          />
        ))}

        {/* CTA overlaid at center, fades in at end */}
        <div
          ref={ctaRef}
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <button
            onClick={onViewAll}
            className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-semibold transition-colors shadow-lg shadow-indigo-500/30"
          >
            View All Activities
          </button>
        </div>
      </div>
    </section>
  );
}
