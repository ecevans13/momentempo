interface Brand {
  name: string;
  src: string;
  top: string;
  left: string;
  width: string;
  duration: number;
  opacity?: number;
  hideMobile?: boolean;
  flip?: string;
}

const BRANDS: Brand[] = [
  { name: "Runna", src: "/brands/runna.svg", top: "10%", left: "6%", width: "220px", duration: 28, opacity: 0.25 },
  { name: "Strava", src: "/brands/strava.svg", top: "22%", left: "72%", width: "240px", duration: 34, opacity: 0.25 },
  { name: "Fitbod", src: "/brands/fitbod.svg", top: "58%", left: "10%", width: "200px", duration: 30, opacity: 0.22 },
  { name: "Nike", src: "/brands/nike.svg", top: "15%", left: "42%", width: "140px", duration: 38 },
  { name: "Hevy", src: "/brands/hevy.svg", top: "68%", left: "70%", width: "110px", duration: 26 },
  { name: "On", src: "/brands/on-running.svg", top: "40%", left: "82%", width: "100px", duration: 32, hideMobile: true },
  { name: "New Balance", src: "/brands/new-balance.svg", top: "75%", left: "38%", width: "140px", duration: 36, hideMobile: true },
];

export default function FloatingBrands() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {BRANDS.map((b) => (
        <img
          key={b.name}
          src={b.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={`absolute animate-float-drift ${b.hideMobile ? "hidden sm:block" : ""}`}
          style={{
            top: b.top,
            left: b.left,
            width: b.width,
            height: "auto",
            filter: `brightness(0) invert(1) blur(4px)`,
            opacity: b.opacity ?? 0.16,
            transform: b.flip || undefined,
            animationName: "float-drift",
            animationDuration: `${b.duration}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDelay: `${b.duration * -0.3}s`,
          }}
        />
      ))}
    </div>
  );
}
