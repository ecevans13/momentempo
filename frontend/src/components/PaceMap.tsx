import { lazy, Suspense } from "react";

// Lazy-load Leaflet components for code splitting
const PaceMapLeaflet = lazy(() => import("./PaceMapLeaflet"));

interface PaceMapProps {
  latlng: [number, number][];
  velocity: number[];
}

export default function PaceMap({ latlng, velocity }: PaceMapProps) {
  if (latlng.length < 2) return null;

  return (
    <Suspense
      fallback={
        <div className="h-64 rounded-lg bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PaceMapLeaflet latlng={latlng} velocity={velocity} />
    </Suspense>
  );
}
