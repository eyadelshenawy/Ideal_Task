export default function StatCard({
  label, value, color, onClick, active,
}: {
  label: string;
  value: number | string;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
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
