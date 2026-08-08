"use client";

import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { STATUSES, formatDateDisplay } from "@/lib/taskHelpers";
import Chip from "./ui/Chip";
import ProgressBar from "./ui/ProgressBar";

interface TrackData {
  code: string | null;
  title: string;
  status: string;
  dueDate: string | null;
  progress: number;
  projectName: string | null;
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "This link is no longer valid");
  return r.json();
});

export default function TrackPageContent({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR<TrackData>(`/api/public/track/${token}`, fetcher, { refreshInterval: 30000 });

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

  const status = STATUSES.find((s) => s.id === data.status) ?? STATUSES[0];

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-brand-dark px-4 py-4">
        <div className="max-w-[480px] mx-auto">
          <div className="text-white font-bold text-[16px]">{data.projectName ?? "Your request"}</div>
          <div className="text-[#CFE3D8] text-[12px]">Request status — read only</div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-5">
        <div className="bg-white border border-brand-border rounded-[10px] px-4 py-3" style={{ borderRight: `4px solid ${status.color}` }}>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {data.code && <span className="font-mono text-[11px] text-brand-sub">{data.code}</span>}
              <span className="font-semibold text-[14px] text-brand-text">{data.title}</span>
            </div>
            <Chip small style={{ background: status.color + "22", color: status.color }}>{status.label}</Chip>
          </div>
          {data.dueDate && <div className="text-[11.5px] text-brand-sub mb-1.5">Expected: {formatDateDisplay(data.dueDate)}</div>}
          <ProgressBar value={data.progress} color={status.color} />
        </div>
      </div>

      <div className="px-4 py-4 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي)
      </div>
    </div>
  );
}
