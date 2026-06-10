export function MetricCard({
  label,
  value,
  note,
  accent = "text-white"
}: {
  label: string;
  value: string;
  note: string;
  accent?: string;
}) {
  return (
    <div className="panel p-5">
      <div className="panel-title">{label}</div>
      <div className={`metric-value mt-3 ${accent}`}>{value}</div>
      <div className="metric-label mt-2">{note}</div>
    </div>
  );
}
