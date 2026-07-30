"use client";

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
  const { data } = useSWR<AuditEntry[]>("/api/audit-log", fetcher);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[520px] max-h-[80vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Audit Log</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          System-wide history: logins, team and project management, permission changes. Per-task activity lives on each task instead.
        </div>

        <div className="flex flex-col">
          {!data && <div className="text-sm text-brand-sub text-center py-8">Loading…</div>}
          {data?.length === 0 && <div className="text-sm text-brand-sub text-center py-8">No entries yet</div>}
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
