"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import type { Priority } from "@/types/models";
import type { SlaTargets } from "@/lib/sla";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SlaConfigResponse {
  targets: SlaTargets;
  cutoffDate: string | null;
}

const ROWS: { key: Priority; label: string }[] = [
  { key: "HIGH", label: "High" },
  { key: "MEDIUM", label: "Medium" },
  { key: "LOW", label: "Low" },
];

export default function SlaSettingsModal({ onClose }: { onClose: () => void }) {
  const { data, mutate } = useSWR<SlaConfigResponse>("/api/settings/sla", fetcher);
  const [targets, setTargets] = useState<SlaTargets | null>(null);
  const [cutoffDate, setCutoffDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (data) {
      setTargets(data.targets);
      setCutoffDate(data.cutoffDate ?? "");
    }
  }, [data]);

  function setField(priority: Priority, field: "responseHours" | "resolutionDays", value: number) {
    if (!targets) return;
    setTargets({ ...targets, [priority]: { ...targets[priority], [field]: value } });
  }

  async function save() {
    if (!targets) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets, cutoffDate: cutoffDate || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save SLA settings");
      await mutate(body);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save SLA settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Default SLA Targets</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11px] text-brand-sub -mt-2 mb-3">Used by any project that hasn&apos;t set its own targets (Manage Projects → SLA targets).</div>

        {!targets ? (
          <div className="text-sm text-brand-sub py-6 text-center">Loading…</div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-[70px_1fr_1fr] gap-2 text-[10px] font-bold text-brand-sub uppercase tracking-wide">
                <span>Priority</span>
                <span>Response (hours)</span>
                <span>Resolution (days)</span>
              </div>
              {ROWS.map((r) => (
                <div key={r.key} className="grid grid-cols-[70px_1fr_1fr] gap-2 items-center">
                  <span className="text-[13px] text-brand-text font-semibold">{r.label}</span>
                  <input
                    type="number" min={1}
                    value={targets[r.key].responseHours}
                    onChange={(e) => setField(r.key, "responseHours", Number(e.target.value))}
                    className="rounded-lg border border-brand-border px-2 py-1.5 text-sm outline-none"
                  />
                  <input
                    type="number" min={1}
                    value={targets[r.key].resolutionDays}
                    onChange={(e) => setField(r.key, "resolutionDays", Number(e.target.value))}
                    className="rounded-lg border border-brand-border px-2 py-1.5 text-sm outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-brand-sub">Only apply SLA to tasks created on/after</label>
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="w-full mt-1 rounded-lg border border-brand-border px-2 py-2 text-sm outline-none"
              />
              <div className="text-[11px] text-brand-sub mt-1">
                Leave blank to include every task. Useful right after turning this on, so old backlog tasks that predate it don&apos;t all read as breached.
              </div>
            </div>

            {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

            <div className="flex items-center gap-2 mt-4">
              <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-brand-dark text-white py-2 text-sm font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={onClose} className="flex-1 rounded-lg border border-brand-border text-brand-text py-2 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
