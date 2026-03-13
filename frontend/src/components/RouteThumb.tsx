import { useRef, useEffect, useState } from "react";
import { decodePolyline } from "../utils/polyline";
import { downsample } from "../utils/downsample";

interface RouteThumbProps {
  polyline: string;
  width?: number;
  height?: number;
}

// --- Slippy map math ---

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function fitZoom(
  minLat: number, maxLat: number, minLng: number, maxLng: number,
  width: number, height: number,
): number {
  for (let z = 18; z >= 1; z--) {
    const topLeft = latLngToTile(maxLat, minLng, z);
    const bottomRight = latLngToTile(minLat, maxLng, z);
    const pxW = (bottomRight.x - topLeft.x) * 256;
    const pxH = (bottomRight.y - topLeft.y) * 256;
    if (pxW <= width && pxH <= height) return z;
  }
  return 1;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  zoom: number,
  centerX: number, centerY: number,
  width: number, height: number,
) {
  const toPixel = (lat: number, lng: number) => {
    const t = latLngToTile(lat, lng, zoom);
    const px = (t.x - centerX) * 256 + width / 2;
    const py = (t.y - centerY) * 256 + height / 2;
    return { px, py };
  };

  // Glow
  ctx.shadowColor = "rgba(99, 102, 241, 0.6)";
  ctx.shadowBlur = 10;

  // Gradient stroke
  const start = toPixel(points[0][0], points[0][1]);
  const end = toPixel(points[points.length - 1][0], points[points.length - 1][1]);
  const gradient = ctx.createLinearGradient(start.px, start.py, end.px, end.py);
  gradient.addColorStop(0, "#6366f1");
  gradient.addColorStop(1, "#2dd4bf");

  ctx.beginPath();
  const p0 = toPixel(points[0][0], points[0][1]);
  ctx.moveTo(p0.px, p0.py);
  for (let i = 1; i < points.length; i++) {
    const p = toPixel(points[i][0], points[i][1]);
    ctx.lineTo(p.px, p.py);
  }
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

export default function RouteThumb({ polyline, width = 200, height = 200 }: RouteThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tilesLoaded, setTilesLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setTilesLoaded(false);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    let points = decodePolyline(polyline);
    if (points.length < 2) return;
    points = downsample(points, 200);

    // Bounding box of the actual route
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    // Center on the actual route center
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Add generous padding for zoom calculation so full route fits with margin
    const latPad = (maxLat - minLat) * 0.25 || 0.003;
    const lngPad = (maxLng - minLng) * 0.25 || 0.003;

    const zoom = fitZoom(
      minLat - latPad, maxLat + latPad,
      minLng - lngPad, maxLng + lngPad,
      width, height,
    );
    const centerTile = latLngToTile(centerLat, centerLng, zoom);

    // Determine which tiles we need (use padded bounds for coverage)
    const topLeft = latLngToTile(maxLat + latPad, minLng - lngPad, zoom);
    const bottomRight = latLngToTile(minLat - latPad, maxLng + lngPad, zoom);
    const tileMinX = Math.floor(topLeft.x) - 1;
    const tileMaxX = Math.floor(bottomRight.x) + 1;
    const tileMinY = Math.floor(topLeft.y) - 1;
    const tileMaxY = Math.floor(bottomRight.y) + 1;

    // Dark background while tiles load
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);

    // Draw route immediately (on dark bg), then re-draw with tiles
    drawRoute(ctx, points, zoom, centerTile.x, centerTile.y, width, height);

    // Load tiles and redraw
    const tilePromises: Promise<{ img: HTMLImageElement; tx: number; ty: number } | null>[] = [];

    for (let tx = tileMinX; tx <= tileMaxX; tx++) {
      for (let ty = tileMinY; ty <= tileMaxY; ty++) {
        const url = `https://a.basemaps.cartocdn.com/dark_all/${zoom}/${tx}/${ty}@2x.png`;
        tilePromises.push(
          loadImage(url)
            .then((img) => ({ img, tx, ty }))
            .catch(() => null)
        );
      }
    }

    let cancelled = false;
    Promise.all(tilePromises).then((tiles) => {
      if (cancelled) return;

      // Reset transform fully, then reapply DPR scale
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Draw tiles
      for (const tile of tiles) {
        if (!tile) continue;
        const px = (tile.tx - centerTile.x) * 256 + width / 2;
        const py = (tile.ty - centerTile.y) * 256 + height / 2;
        ctx.drawImage(tile.img, px, py, 256, 256);
      }

      // Slight darken overlay so route pops
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(0, 0, width, height);

      // Redraw route on top of tiles
      drawRoute(ctx, points, zoom, centerTile.x, centerTile.y, width, height);
      setTilesLoaded(true);
    });

    return () => { cancelled = true; };
  }, [polyline, width, height]);

  return (
    <div className="relative" style={{ width, height }}>
      {/* Shimmer overlay while tiles load */}
      {!tilesLoaded && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.5s_infinite] rounded-lg" />
      )}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width, height }}
        className="block"
      />
    </div>
  );
}
