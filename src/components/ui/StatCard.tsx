export default function StatCard({
  label, value, color, onClick, active, compact,
}: {
  label: string;
  value: number | string;
  color: string;
  onClick?: () => void;
  active?: boolean;
  /** A small one-line pill ("14 Total") instead of the tall card. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className="flex flex-col sm:flex-row items-center sm:items-baseline justify-center sm:gap-1.5 rounded-[10px] px-1 sm:px-3 py-1 sm:py-1.5 min-w-0"
        style={{
          background: active ? color : "#FFFFFF",
          border: `1px solid ${active ? color : "#E1E8E4"}`,
          cursor: onClick ? "pointer" : "default",
        }}
      >
        <span className="text-[15px] font-bold leading-none" style={{ color: active ? "#fff" : "#16261F" }}>{value}</span>
        <span className="text-[10px] sm:text-[11.5px] truncate max-w-full" style={{ color: active ? "#fff" : "#5B6B64" }}>{label}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex-1 text-center rounded-[10px] px-1 py-1.5 sm:py-[9px] min-w-0 sm:min-w-[84px]"
      style={{
        background: active ? color : "#FFFFFF",
        border: `1px solid ${active ? color : "#E1E8E4"}`,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="text-[16px] sm:text-[19px] font-bold leading-tight" style={{ color: active ? "#fff" : "#16261F" }}>{value}</div>
      <div className="text-[10px] sm:text-[10.5px] mt-0.5" style={{ color: active ? "#fff" : "#5B6B64" }}>{label}</div>
    </button>
  );
}
