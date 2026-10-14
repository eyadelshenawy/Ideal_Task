import type { TicketType } from "@/types/models";
import { ticketTypeMeta } from "@/lib/ticketMeta";

// Plain tasks show nothing; support tickets get a short coloured tag.
export default function TicketTypeChip({ type }: { type: TicketType }) {
  if (type === "TASK") return null;
  const m = ticketTypeMeta(type);
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: m.bg, color: m.color }} title={m.label}>
      {m.short}
    </span>
  );
}
