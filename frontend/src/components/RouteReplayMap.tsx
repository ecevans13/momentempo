import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import { formatDistance, formatDuration } from "../utils/format";
import "leaflet/dist/leaflet.css";

interface RouteReplayMapProps {
  points: [number, number][];
  totalDistance: number;
  totalTime: number;
}

const SPEEDS = [1, 2, 5, 10];
const DEFAULT_DURATION = 30; // seconds at 1x

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, bounds]);
  return null;
}

export default function RouteReplayMap({ points, totalDistance, totalTime }: RouteReplayMapProps) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1
  const [speed, setSpeed] = useState(1);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const duration = DEFAULT_DURATION / speed; // actual playback duration in seconds
  const currentIndex = Math.min(Math.floor(progress * points.length), points.length - 1);
  const trailPoints = points.slice(0, currentIndex + 1);
  const currentPoint = points[currentIndex];

  // Compute cumulative distances for stats
  const cumulativeDistances = useRef<number[]>([]);
  if (cumulativeDistances.current.length !== points.length) {
    const dists = [0];
    for (let i = 1; i < points.length; i++) {
      const [lat1, lng1] = points[i - 1];
      const [lat2, lng2] = points[i];
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      dists.push(dists[i - 1] + R * c);
    }
    cumulativeDistances.current = dists;
  }

  const polylineTotalDist = cumulativeDistances.current[points.length - 1] || 1;
  const currentPolylineDist = cumulativeDistances.current[currentIndex] || 0;
  const progressRatio = currentPolylineDist / polylineTotalDist;
  const currentDistance = totalDistance * progressRatio;
  const currentElapsed = totalTime * progressRatio;

  const animate = useCallback(
    (timestamp: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setProgress((prev) => {
        const next = prev + delta / duration;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    },
    [duration],
  );

  useEffect(() => {
    if (playing) {
      lastTimeRef.current = 0;
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [playing, animate]);

  const bounds = points.reduce(
    (acc, [lat, lng]) => [
      [Math.min(acc[0][0], lat), Math.min(acc[0][1], lng)],
      [Math.max(acc[1][0], lat), Math.max(acc[1][1], lng)],
    ],
    [
      [90, 180],
      [-90, -180],
    ],
  ) as LatLngBoundsExpression;

  const isDark = typeof window !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <div className="space-y-3">
      <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" style={{ height: 300 }}>
        <MapContainer
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
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
          {/* Full route - faint */}
          <Polyline positions={points} color="#6B7280" weight={3} opacity={0.3} />
          {/* Animated trail */}
          {trailPoints.length > 1 && (
            <Polyline positions={trailPoints} color="#14B8A6" weight={4} opacity={0.9} />
          )}
          {/* Current position marker */}
          {currentPoint && (
            <CircleMarker
              center={currentPoint}
              radius={6}
              pathOptions={{ fillColor: "#14B8A6", fillOpacity: 1, color: "#fff", weight: 2 }}
            />
          )}
        </MapContainer>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (progress >= 1) setProgress(0);
            setPlaying(!playing);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
        >
          {playing ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>

        {/* Progress scrubber */}
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => {
            setProgress(parseFloat(e.target.value));
            setPlaying(false);
          }}
          className="flex-1 h-1 accent-indigo-500"
        />

        {/* Speed selector */}
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                speed === s
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Stats overlay */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>{formatDistance(currentDistance)}</span>
        <span>{formatDuration(Math.round(currentElapsed))}</span>
        {currentDistance > 100 && currentElapsed > 0 && (
          <span>
            {formatDuration(Math.round(currentElapsed / (currentDistance / 1000)))} /km
          </span>
        )}
      </div>
    </div>
  );
}
