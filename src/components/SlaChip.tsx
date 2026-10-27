"use client";

import { Timer } from "lucide-react";
import { formatDistance, type TaskSla } from "@/lib/taskSla";

// Compact SLA indicator for cards and rows: shows the most urgent open
// deadline, or "SLA breached". Hidden once both targets are met.
export default function SlaChip({ sla }: { sla: TaskSla }) {
  if (sla.response === "breached" || sla.resolution === "breached") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#FBE7E5", color: "#9A3530" }} title="SLA breached">
        <Timer size={10} /> SLA breached
      </span>
    );
  }
  if (sla.paused && sla.response !== "pending") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#EFEAF7", color: "#5E4A8C" }} title="Waiting on the customer — the resolution clock is stopped">
        <Timer size={10} /> SLA paused
      </span>
    );
  }
  const open = [
    sla.response === "pending" ? { label: "Respond", due: sla.responseDue } : null,
    sla.resolution === "pending" ? { label: "Resolve", due: sla.resolutionDue } : null,
  ].filter((x): x is { label: string; due: Date } => x !== null);
  if (open.length === 0) return null;
  const next = open.sort((a, b) => a.due.getTime() - b.due.getTime())[0];
  const left = next.due.getTime() - Date.now();
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: "#FFF3D6", color: "#8A5A00" }}
      title={`${next.label} by ${next.due.toLocaleString("en-GB")}`}
    >
      <Timer size={10} /> {next.label} in {formatDistance(left)}
    </span>
  );
}
