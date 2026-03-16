import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface GearShoe {
  name: string;
  model: string;
  brand: string;
  image: string;
  distance: string;
  status: "Active" | "Retired";
}

const SHOES: GearShoe[] = [
  {
    name: "On Cloudsurfer Next",
    model: "Cloudsurfer Next",
    brand: "On",
    image: "/gear/cloudsurfer-next.png",
    distance: "399 mi",
    status: "Retired",
  },
  {
    name: "New Balance FuelCell Rebel v5",
    model: "FuelCell Rebel v5",
    brand: "New Balance",
    image: "/gear/fuelcell-rebel-v5.png",
    distance: "72 mi",
    status: "Active",
  },
  {
    name: "On Cloudsurfer Max",
    model: "Cloudsurfer Max",
    brand: "On",
    image: "/gear/cloudmonster-max.png",
    distance: "37 mi",
    status: "Active",
  },
];

export default function LandingGear() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !pinnedRef.current) return;

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

      tl.fromTo(
        titleRef.current,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.6 },
        0
      );

      const cards = cardsRef.current?.children;
      if (cards) {
        Array.from(cards).forEach((card, i) => {
          tl.fromTo(
            card,
            { opacity: 0, x: i % 2 === 0 ? -80 : 80 },
            { opacity: 1, x: 0, duration: 0.6 },
            0.4 + i * 0.4
          );
        });
      }

      tl.to({}, { duration: 0.5 });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

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
        <div className="flex flex-col items-center px-6 max-w-6xl w-full">
          <h2
            ref={titleRef}
            className="text-4xl sm:text-6xl font-bold text-white tracking-tight mb-12 opacity-0"
          >
            The Rotation
          </h2>

          <div
            ref={cardsRef}
            className="grid grid-cols-1 sm:grid-cols-3 gap-8 w-full"
          >
            {SHOES.map((shoe) => (
              <div
                key={shoe.name}
                className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden opacity-0"
              >
                {/* Shoe image */}
                <div className="relative h-56 bg-gradient-to-b from-gray-900/50 to-black flex items-center justify-center p-6 overflow-hidden">
                  <img
                    src={shoe.image}
                    alt={shoe.name}
                    className="max-h-full max-w-full object-contain drop-shadow-[0_8px_24px_rgba(99,102,241,0.15)] group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>

                {/* Info */}
                <div className="p-6">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    {shoe.brand}
                  </p>
                  <h3 className="text-lg font-bold text-white">
                    {shoe.model}
                  </h3>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-gray-400">{shoe.distance}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        shoe.status === "Active"
                          ? "bg-teal-500/10 text-teal-400"
                          : "bg-gray-500/10 text-gray-500"
                      }`}
                    >
                      {shoe.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
