import { useRef, useEffect } from "react";

/**
 * A 3D helical curtain of dots that spirals in the background.
 * Uses slow parallax scrolling so the helix mostly rotates in place
 * during pinned sections, but drifts gently between sections.
 */
export default function DotCurtain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Helix config
    const STRANDS = 3;
    const HELIX_RADIUS = 160;
    const DOT_SPACING = 12;       // tighter vertical spacing
    const DOT_RADIUS_MAX = 2.6;
    const ROTATION_SPEED = 0.2;
    const PERSPECTIVE = 350;
    const TWIST_RATE = 0.1;
    const SCROLL_PARALLAX = 0.12; // helix moves at 12% of scroll speed

    // Seeded pseudo-random
    function seededRandom(seed: number): number {
      const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
      return x - Math.floor(x);
    }

    // Pre-generate a large pool of scatter dots that fill around the helix
    // These include: on-strand dots, near-strand scatter, and ambient dust
    const TOTAL_POOL = 4000;
    interface DotSeed {
      yOffset: number;       // world-Y position (repeating tile)
      strandIndex: number;   // which strand (-1 = scatter/dust)
      angleJitter: number;   // offset from strand angle
      radiusFrac: number;    // fraction of helix radius
      xJitter: number;       // random x offset
      yJitter: number;       // random y offset
      sizeBase: number;      // base dot size
      alphaBase: number;     // base alpha
      breathPhase: number;   // phase for breathing animation
      driftSpeed: number;    // slow angular drift
    }

    const pool: DotSeed[] = [];
    const TILE_HEIGHT = 1200; // dots repeat every 1200px of helix space

    for (let i = 0; i < TOTAL_POOL; i++) {
      const r = (n: number) => seededRandom(i * 17 + n);
      const kind = r(0); // 0-0.35: on-strand, 0.35-0.7: near-strand scatter, 0.7-1: ambient dust

      if (kind < 0.35) {
        // On-strand dot with jitter
        pool.push({
          yOffset: r(1) * TILE_HEIGHT,
          strandIndex: Math.floor(r(2) * STRANDS),
          angleJitter: (r(3) - 0.5) * 0.3,
          radiusFrac: 0.9 + r(4) * 0.2, // close to strand radius
          xJitter: (r(5) - 0.5) * 20,
          yJitter: (r(6) - 0.5) * 10,
          sizeBase: 1.0 + r(7) * 1.4,
          alphaBase: 0.12 + r(8) * 0.2,
          breathPhase: r(9) * Math.PI * 2,
          driftSpeed: 0,
        });
      } else if (kind < 0.7) {
        // Near-strand scatter — orbits loosely around helix
        pool.push({
          yOffset: r(1) * TILE_HEIGHT,
          strandIndex: Math.floor(r(2) * STRANDS),
          angleJitter: (r(3) - 0.5) * 1.2, // wider angle offset
          radiusFrac: 0.4 + r(4) * 0.8,
          xJitter: (r(5) - 0.5) * 35,
          yJitter: (r(6) - 0.5) * 18,
          sizeBase: 0.5 + r(7) * 1.0,
          alphaBase: 0.06 + r(8) * 0.12,
          breathPhase: r(9) * Math.PI * 2,
          driftSpeed: (r(10) - 0.5) * 0.15,
        });
      } else {
        // Ambient dust — very loose, small, dim
        pool.push({
          yOffset: r(1) * TILE_HEIGHT,
          strandIndex: -1,
          angleJitter: r(3) * Math.PI * 2,
          radiusFrac: r(4) * 1.3,
          xJitter: (r(5) - 0.5) * 50,
          yJitter: (r(6) - 0.5) * 25,
          sizeBase: 0.3 + r(7) * 0.7,
          alphaBase: 0.03 + r(8) * 0.07,
          breathPhase: r(9) * Math.PI * 2,
          driftSpeed: (r(10) - 0.5) * 0.25,
        });
      }
    }

    let time = 0;
    let prevTimestamp = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(timestamp: number) {
      if (!ctx || !canvas) return;

      const dt = prevTimestamp ? (timestamp - prevTimestamp) / 1000 : 0.016;
      prevTimestamp = timestamp;
      if (!prefersReduced) time += dt;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const scrollY = window.scrollY;
      const centerX = w / 2;

      ctx.clearRect(0, 0, w, h);

      // Slow parallax offset — helix barely moves during pinned sections
      const helixScrollOffset = scrollY * SCROLL_PARALLAX;

      // We render dots in a window around the current parallax position
      // The tile repeats so we always have coverage
      const viewStart = helixScrollOffset - 100;
      const viewEnd = helixScrollOffset + h + 100;

      const dots: { x: number; y: number; z: number; r: number; alpha: number }[] = [];

      // Figure out which tile copies we need
      const firstTile = Math.floor(viewStart / TILE_HEIGHT) - 1;
      const lastTile = Math.ceil(viewEnd / TILE_HEIGHT) + 1;

      for (let tile = firstTile; tile <= lastTile; tile++) {
        const tileBase = tile * TILE_HEIGHT;

        for (let p = 0; p < TOTAL_POOL; p++) {
          const seed = pool[p];
          const worldY = tileBase + seed.yOffset;
          const screenY = worldY - helixScrollOffset;

          if (screenY < -50 || screenY > h + 50) continue;

          // Base angle from strand position + vertical twist
          const verticalAngle = (worldY / DOT_SPACING) * TWIST_RATE;
          let angle: number;

          if (seed.strandIndex >= 0) {
            const strandOffset = (seed.strandIndex / STRANDS) * Math.PI * 2;
            angle = strandOffset + verticalAngle + seed.angleJitter + time * ROTATION_SPEED;
          } else {
            angle = seed.angleJitter + verticalAngle * 0.5 + time * (ROTATION_SPEED * 0.6) + seed.driftSpeed * time;
          }

          // Add drift for scatter dots
          if (seed.driftSpeed !== 0) {
            angle += seed.driftSpeed * time;
          }

          const radius = HELIX_RADIUS * seed.radiusFrac;
          const x3d = Math.cos(angle) * radius + seed.xJitter;
          const z3d = Math.sin(angle) * radius;

          const scale = PERSPECTIVE / (PERSPECTIVE + z3d);
          const screenX = centerX + x3d * scale;
          const sy = screenY + seed.yJitter;

          const depthNorm = (z3d + HELIX_RADIUS) / (2 * HELIX_RADIUS);

          // Breathing
          const breathe = Math.sin(time * 0.4 + seed.breathPhase) * 0.15;

          const dotRadius = (seed.sizeBase + breathe) * scale;
          const alpha = seed.alphaBase * (0.5 + 0.5 * depthNorm);

          if (dotRadius < 0.2 || alpha < 0.01) continue;

          dots.push({
            x: screenX,
            y: sy,
            z: z3d,
            r: Math.min(dotRadius, DOT_RADIUS_MAX),
            alpha: Math.min(alpha, 0.35),
          });
        }
      }

      // Sort back-to-front
      dots.sort((a, b) => a.z - b.z);

      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${dot.alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
}
