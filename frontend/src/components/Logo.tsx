export default function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/logo-full.png"
      alt="MomenTum Tempo"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
