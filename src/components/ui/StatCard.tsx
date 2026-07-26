export default function StatCard({
  label, value, color, onClick, active,
}: {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex-1 text-center rounded-[10px] px-1 py-[9px]"
      style={{
        background: active ? color : "#FFFFFF",
        border: `1px solid ${active ? color : "#E1E8E4"}`,
        minWidth: 84,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="text-[19px] font-bold" style={{ color: active ? "#fff" : "#16261F" }}>{value}</div>
      <div className="text-[10.5px] mt-0.5" style={{ color: active ? "#fff" : "#5B6B64" }}>{label}</div>
    </button>
  );
}
