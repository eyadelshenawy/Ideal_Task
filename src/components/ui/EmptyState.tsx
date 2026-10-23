import { Sprout } from "lucide-react";

/** A friendly empty list: a small brand-coloured icon, a line and a hint. */
export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <span className="w-12 h-12 rounded-full flex items-center justify-center mb-2" style={{ background: "#E8F2EE" }}>
        <Sprout size={22} style={{ color: "#0A5A46" }} />
      </span>
      <div className="font-semibold text-[14px]" style={{ color: "#0A5A46" }}>{title}</div>
      {hint && <div className="text-[12px] text-brand-sub mt-0.5">{hint}</div>}
    </div>
  );
}
