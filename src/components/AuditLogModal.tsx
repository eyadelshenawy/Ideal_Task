"use client";

import { useState } from "react";
import useSWR from "swr";
import { X } from "lucide-react";

interface AuditEntry {
  id: string;
  message: string;
  actorName: string;
  createdAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditLogModal({ onClose }: { onClose: () => void }) {
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const params = new URLSearchParams();
  if (actorId) params.set("actorId", actorId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (q.trim()) params.set("q", q.trim());
  const { data } = useSWR<AuditEntry[]>(`/api/audit-log?${params.toString()}`, fetcher, { keepPreviousData: true });
  const { data: team } = useSWR<{ id: string; name: string }[]>("/api/team", fetcher);
  const filtered = !!(actorId || from || to || q.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[620px] h-full sm:h-auto max-h-none sm:max-h-[80vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Audit Log</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          System-wide history: logins, team and project management, permission changes. Per-task activity lives on each task instead.
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="flex-1 min-w-[120px] rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
          />
          <select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="rounded-lg border border-brand-border px-2 py-1.5 text-xs bg-white outline-none"
          >
            <option value="">Everyone</option>
            {team?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" className="rounded-lg border border-brand-border px-2 py-1 text-xs outline-none" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" className="rounded-lg border border-brand-border px-2 py-1 text-xs outline-none" />
          {filtered && (
            <button onClick={() => { setActorId(""); setFrom(""); setTo(""); setQ(""); }} className="text-xs text-brand-dark underline px-1">
              Clear
            </button>
          )}
        </div>
        {data && <div className="text-[11px] text-brand-sub mb-1">{data.length === 500 ? "Showing the latest 500 matching entries" : `${data.length} entr${data.length === 1 ? "y" : "ies"}`}</div>}
        <div className="flex flex-col">
          {!data && <div className="text-sm text-brand-sub text-center py-8">Loading…</div>}
          {data?.length === 0 && <div className="text-sm text-brand-sub text-center py-8">{filtered ? "Nothing matches these filters" : "No entries yet"}</div>}
          {data?.map((e) => (
            <div key={e.id} className="py-2 border-b border-brand-border">
              <div className="text-[12.5px] text-brand-text">
                <span className="font-semibold">{e.actorName}</span> — {e.message}
              </div>
              <div className="text-[10.5px] text-brand-sub mt-0.5">{formatWhen(e.createdAt)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
