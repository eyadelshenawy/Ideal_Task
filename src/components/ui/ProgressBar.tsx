export default function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 4, background: "#EEF2F0", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", width: `${value || 0}%`, background: color }} />
    </div>
  );
}
