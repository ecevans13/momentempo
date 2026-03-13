import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { downsampleParallel } from "../utils/downsample";
import "leaflet/dist/leaflet.css";

interface PaceMapLeafletProps {
  latlng: [number, number][];
  velocity: number[];
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, bounds]);
  return null;
}

/**
 * Linearly interpolate between red (slow) and green (fast).
 * t=0 => red rgb(239,68,68), t=1 => green rgb(34,197,94)
 */
function lerpColor(t: number): string {
  const r = Math.round(239 + (34 - 239) * t);
  const g = Math.round(68 + (197 - 68) * t);
  const b = Math.round(68 + (94 - 68) * t);
  return `rgb(${r},${g},${b})`;
}

export default function PaceMapLeaflet({ latlng, velocity }: PaceMapLeafletProps) {
  const TARGET_POINTS = 300;

  const { segments, bounds } = useMemo(() => {
    // Downsample latlng and velocity in parallel to preserve index alignment
    const [sampledLatlng, sampledVelocity] = downsampleParallel(
      [latlng as unknown as number[][], velocity as unknown as number[][]],
      TARGET_POINTS,
    ) as unknown as [[number, number][], number[]];

    // Compute min/max speed (filter zeros to avoid skewing the scale)
    const nonZeroVelocity = sampledVelocity.filter((v) => v > 0);
    const minSpeed = nonZeroVelocity.length > 0 ? Math.min(...nonZeroVelocity) : 0;
    const maxSpeed = nonZeroVelocity.length > 0 ? Math.max(...nonZeroVelocity) : 1;
    const speedRange = maxSpeed - minSpeed || 1;

    // Build pace-colored segments: each segment = two consecutive points
    const segs: { positions: [number, number][]; color: string }[] = [];
    for (let i = 0; i < sampledLatlng.length - 1; i++) {
      const v = sampledVelocity[i];
      const t = v > 0 ? (v - minSpeed) / speedRange : 0;
      segs.push({
        positions: [sampledLatlng[i], sampledLatlng[i + 1]],
        color: lerpColor(t),
      });
    }

    // Compute bounds from full latlng array
    const mapBounds = latlng.reduce(
      (acc, [lat, lng]) => [
        [Math.min(acc[0][0], lat), Math.min(acc[0][1], lng)],
        [Math.max(acc[1][0], lat), Math.max(acc[1][1], lng)],
      ],
      [
        [90, 180],
        [-90, -180],
      ],
    ) as LatLngBoundsExpression;

    return { segments: segs, bounds: mapBounds };
  }, [latlng, velocity]);

  const isDark =
    typeof window !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div>
      <div
        className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
        style={{ height: 300 }}
      >
        <MapContainer
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          zoomControl={false}
        >
          <FitBounds bounds={bounds} />
          <TileLayer
            url={
              isDark
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            }
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          />
          {segments.map((seg, i) => (
            <Polyline
              key={i}
              positions={seg.positions}
              pathOptions={{ color: seg.color, weight: 4, opacity: 0.9 }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Pace legend */}
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Slower</span>
        <div
          className="flex-1 h-2 rounded-full"
          style={{
            background: "linear-gradient(to right, rgb(239,68,68), rgb(34,197,94))",
          }}
        />
        <span>Faster</span>
      </div>
    </div>
  );
}
