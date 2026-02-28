const SPORTS = [
  { value: "", label: "All Sports" },
  { value: "Run", label: "Run" },
  { value: "TrailRun", label: "Trail Run" },
  { value: "Ride", label: "Ride" },
  { value: "Swim", label: "Swim" },
  { value: "Hike", label: "Hike" },
  { value: "Walk", label: "Walk" },
  { value: "Workout", label: "Workout" },
];

interface SportFilterProps {
  value: string;
  onChange: (sport: string) => void;
}

export default function SportFilter({ value, onChange }: SportFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm rounded-md px-2 py-1 border border-gray-200 dark:border-gray-700"
    >
      {SPORTS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
