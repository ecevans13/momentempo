import { lazy, Suspense } from "react";
import { decodePolyline } from "../utils/polyline";

// Lazy-load Leaflet components for code splitting
const LeafletMap = lazy(() => import("./RouteReplayMap"));

interface RouteReplayProps {
  polyline: string;
  totalDistance: number;
  totalTime: number;
}

export default function RouteReplay({ polyline, totalDistance, totalTime }: RouteReplayProps) {
  const points = decodePolyline(polyline);

  if (points.length < 2) return null;

  return (
    <Suspense
      fallback={
        <div className="h-64 rounded-lg bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LeafletMap points={points} totalDistance={totalDistance} totalTime={totalTime} />
    </Suspense>
  );
}
