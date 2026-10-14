"use client";

import { Timer } from "lucide-react";
import type { SlaState } from "@/lib/sla";
import { formatDistance, type TaskSla } from "@/lib/taskSla";

function when(d: Date): string {
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Row({ label, due, state }: { label: string; due: Date; state: SlaState }) {
  const now = Date.now();
  const tone =
    state === "met" ? { bg: "#E4F0EA", fg: "#0A5A46", text: "Met" }
    : state === "breached" ? { bg: "#FBE7E5", fg: "#9A3530", text: "Breached" }
    : { bg: "#FFF3D6", fg: "#8A5A00", text: `${formatDistance(due.getTime() - now)} left` };
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-brand-sub">{label}</span>
      <span className="text-brand-text">{when(due)}</span>
      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>{tone.text}</span>
    </div>
  );
}

export default function SlaStatusPanel({ sla }: { sla: TaskSla }) {
  return (
    <div className="rounded-lg border border-brand-border p-2.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-[11px] font-bold text-brand-sub uppercase tracking-wide">
        <Timer size={12} /> SLA
      </div>
      <Row label="Response by" due={sla.responseDue} state={sla.response} />
      <Row label="Resolve by" due={sla.resolutionDue} state={sla.resolution} />
    </div>
  );
}
