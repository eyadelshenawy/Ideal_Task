"use client";

import useSWR from "swr";
import { Loader2, Printer } from "lucide-react";
import { formatDateDisplay } from "@/lib/taskHelpers";
import StatCard from "./ui/StatCard";
import ProgressBar from "./ui/ProgressBar";

interface SlaTally {
  met: number;
  breached: number;
  pending: number;
}

interface ReportData {
  projectName: string;
  projectCode: string;
  generatedAt: string;
  completionRate: number;
  counts: { total: number; open: number; done: number; overdue: number };
  sla: { response: SlaTally; resolution: SlaTally } | null;
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't load this report");
  return r.json();
});

function SlaRow({ label, tally }: { label: string; tally: SlaTally }) {
  const total = tally.met + tally.breached + tally.pending;
  const metPct = total > 0 ? Math.round((tally.met / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12.5px] font-semibold text-brand-text">{label}</span>
        <span className="text-[11.5px] text-brand-sub">{metPct}% met</span>
      </div>
      <ProgressBar value={metPct} color="#0A5A46" />
      <div className="flex gap-3 mt-1 text-[11px] text-brand-sub">
        <span>Met: {tally.met}</span>
        <span>Breached: {tally.breached}</span>
        <span>Pending: {tally.pending}</span>
      </div>
    </div>
  );
}

export default function ProjectReportContent({ projectId }: { projectId: string }) {
  const { data, error, isLoading } = useSWR<ReportData>(`/api/projects/${projectId}/report`, fetcher);

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
        <div className="text-center text-brand-sub text-sm">Couldn&apos;t load this report.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>

      <div className="max-w-[640px] mx-auto px-6 py-8">
        <div className="no-print flex justify-end mb-4">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-dark text-white"
          >
            <Printer size={13} /> Print / Save as PDF
          </button>
        </div>

        <div className="flex items-center gap-2.5 mb-1">
          <div className="relative w-[26px] h-[26px]">
            <div className="absolute top-0 left-0 w-4 h-4 rounded-md bg-brand-dark" />
            <div className="absolute bottom-0 right-0 w-4 h-4 rounded-md bg-brand-light" />
          </div>
          <div className="text-brand-dark font-bold text-[14px]">IDEAL for Digital Transformation</div>
        </div>

        <h1 className="font-bold text-[22px] text-brand-text mt-4">{data.projectName}</h1>
        <div className="text-[12px] text-brand-sub mb-5">
          {data.projectCode} · Status report generated {formatDateDisplay(data.generatedAt.slice(0, 10))}
        </div>

        <div className="bg-white border border-brand-border rounded-[10px] px-4 py-3 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-brand-sub">Overall completion</span>
            <span className="text-sm font-bold text-brand-dark">{data.completionRate}%</span>
          </div>
          <ProgressBar value={data.completionRate} color="#0A5A46" />
        </div>

        <div className="flex gap-2 mb-6">
          <StatCard label="Total" value={data.counts.total} color="#0A5A46" />
          <StatCard label="Open" value={data.counts.open} color="#3D6EA6" />
          <StatCard label="Done" value={data.counts.done} color="#82B478" />
          <StatCard label="Overdue" value={data.counts.overdue} color="#C0524A" />
        </div>

        {data.sla && (
          <div className="bg-white border border-brand-border rounded-[10px] px-4 py-3 mb-6">
            <div className="text-xs font-semibold text-brand-sub mb-3">SLA performance</div>
            <SlaRow label="Response" tally={data.sla.response} />
            <SlaRow label="Resolution" tally={data.sla.resolution} />
          </div>
        )}

        <div className="text-[10.5px] text-brand-sub text-center mt-8">
          © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي)
        </div>
      </div>
    </div>
  );
}
