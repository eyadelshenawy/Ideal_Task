"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Diamond, Loader2 } from "lucide-react";
import { STATUSES, formatDateDisplay } from "@/lib/taskHelpers";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";
import StatCard from "./ui/StatCard";
import ShareTaskDetailModal from "./ShareTaskDetailModal";

interface ShareTask {
  id: string;
  code: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  progress: number;
  isMilestone: boolean;
}

interface ShareData {
  projectName: string;
  projectCode: string;
  completionRate: number;
  tasks: ShareTask[];
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "This link is no longer valid");
  return r.json();
});

type FilterMode = "all" | "open" | "done";

export default function SharePageContent({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR<ShareData>(`/api/public/share/${token}`, fetcher);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const counts = useMemo(() => {
    if (!data) return { total: 0, open: 0, done: 0 };
    const done = data.tasks.filter((t) => t.status === "DONE").length;
    return { total: data.tasks.length, open: data.tasks.length - done, done };
  }, [data]);

  const visibleTasks = useMemo(() => {
    if (!data) return [];
    if (filter === "open") return data.tasks.filter((t) => t.status !== "DONE");
    if (filter === "done") return data.tasks.filter((t) => t.status === "DONE");
    return data.tasks;
  }, [data, filter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-dark" size={28} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="text-center text-brand-sub text-sm">This link is no longer valid.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-brand-dark px-4 py-4">
        <div className="max-w-[640px] mx-auto">
          <div className="text-white font-bold text-[16px]">{data.projectName}</div>
          <div className="text-[#CFE3D8] text-[12px]">Project status — read only</div>
        </div>
      </div>

      <div className="max-w-[640px] mx-auto px-4 py-5">
        <div className="bg-white border border-brand-border rounded-[10px] px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-brand-sub">Overall completion</span>
            <span className="text-sm font-bold text-brand-dark">{data.completionRate}%</span>
          </div>
          <ProgressBar value={data.completionRate} color="#0A5A46" />
        </div>

        <div className="flex gap-2 mb-4">
          <StatCard label="All" value={counts.total} color="#0A5A46" active={filter === "all"} onClick={() => setFilter("all")} />
          <StatCard label="Open" value={counts.open} color="#3D6EA6" active={filter === "open"} onClick={() => setFilter("open")} />
          <StatCard label="Done" value={counts.done} color="#82B478" active={filter === "done"} onClick={() => setFilter("done")} />
        </div>

        <div className="flex flex-col gap-2">
          {visibleTasks.length === 0 && (
            <div className="text-center text-brand-sub text-sm py-10">No tasks to show</div>
          )}
          {visibleTasks.map((t) => {
            const status = STATUSES.find((s) => s.id === t.status) ?? STATUSES[0];
            return (
              <button
                key={t.id}
                onClick={() => setOpenTaskId(t.id)}
                className="text-left bg-white border border-brand-border rounded-[10px] px-3 py-2.5 hover:bg-brand-bg"
                style={{ borderRight: `4px solid ${status.color}` }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {t.isMilestone && <Diamond size={12} className="text-brand-dark" />}
                    {t.code && <span className="font-mono text-[11px] text-brand-sub">{t.code}</span>}
                    <span className="font-semibold text-[13.5px] text-brand-text">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip small style={{ background: status.color + "22", color: status.color }}>{status.label}</Chip>
                    {t.dueDate && <span className="text-[11px] text-brand-sub">{formatDateDisplay(t.dueDate)}</span>}
                  </div>
                </div>
                {!t.isMilestone && <ProgressBar value={t.progress} color={status.color} />}
              </button>
            );
          })}
        </div>
      </div>

      {openTaskId && (
        <ShareTaskDetailModal shareToken={token} taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      )}

      <div className="px-4 py-4 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي)
      </div>
    </div>
  );
}
