"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Loader2, Printer } from "lucide-react";
import { formatDateDisplay, todayStr, PRIORITIES, STATUSES } from "@/lib/taskHelpers";
import type { Priority } from "@/types/models";
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
  priorities: Priority[];
  completionRate: number;
  counts: { total: number; open: number; done: number; overdue: number };
  sla: { response: SlaTally; resolution: SlaTally; byPriority: ({ priority: Priority } & SlaTally)[] } | null;
  period: {
    from: string; to: string; created: number; completed: number;
    resolutionDaysSum: number; avgResolutionDays: number | null;
    months: { month: string; created: number; resolved: number }[];
  } | null;
  openTickets: { code: string | null; title: string; priority: Priority; status: string; created: string; dueDate: string | null; ageDays: number; overdue: boolean }[];
  openCount: number;
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't load this report");
  return r.json();
});

const RECEIVED = "#82B478";
const RESOLVED = "#0A5A46";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** First day of the month `back` months before today, as "YYYY-MM-DD". */
function monthStart(back: number): string {
  const d = new Date();
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth() - back, 1));
  return x.toISOString().slice(0, 10);
}
function monthEnd(back: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() - back + 1, 0)).toISOString().slice(0, 10);
}

const PRESETS: { id: string; label: string; range: () => [string, string] }[] = [
  { id: "this", label: "This month", range: () => [monthStart(0), todayStr()] },
  { id: "last", label: "Last month", range: () => [monthStart(1), monthEnd(1)] },
  { id: "3m", label: "Last 3 months", range: () => [monthStart(2), todayStr()] },
  { id: "6m", label: "Last 6 months", range: () => [monthStart(5), todayStr()] },
  { id: "12m", label: "Last 12 months", range: () => [monthStart(11), todayStr()] },
];

/** met ÷ (met + breached) × 100 — tickets still within their time are not counted yet. */
function metRate(t: SlaTally): number | null {
  const decided = t.met + t.breached;
  return decided > 0 ? Math.round((t.met / decided) * 100) : null;
}

function Kpi({ label, value, formula, tone = "#0A5A46" }: { label: string; value: string; formula: string; tone?: string }) {
  return (
    <div className="flex-1 min-w-[150px] bg-white border border-brand-border rounded-[10px] px-4 py-3 break-inside-avoid">
      <div className="text-[11.5px] font-semibold text-brand-sub">{label}</div>
      <div className="text-[26px] font-bold leading-tight mt-0.5" style={{ color: tone }}>{value}</div>
      <div className="text-[10px] text-brand-sub font-mono mt-1">{formula}</div>
    </div>
  );
}

function Card({ title, formula, children }: { title: string; formula?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-brand-border rounded-[10px] px-4 py-3 mb-4 break-inside-avoid">
      <div className="text-[13px] font-bold text-brand-text">{title}</div>
      {formula && <div className="text-[10px] text-brand-sub font-mono mb-2">{formula}</div>}
      <div className={formula ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function SlaRow({ label, tally }: { label: string; tally: SlaTally }) {
  const rate = metRate(tally);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12.5px] font-semibold text-brand-text">{label}</span>
        <span className="text-[12px] font-semibold text-brand-text">{rate === null ? "—" : `${rate}% met`}</span>
      </div>
      <ProgressBar value={rate ?? 0} color="#0A5A46" />
      <div className="flex gap-3 mt-1 text-[11px] text-brand-sub">
        <span>Met: {tally.met}</span>
        <span>Breached: {tally.breached}</span>
        <span>Still within time: {tally.pending}</span>
      </div>
    </div>
  );
}

/** Tickets received vs resolved per month: paired bars, each labelled with its number. */
function MonthChart({ months }: { months: { month: string; created: number; resolved: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.flatMap((m) => [m.created, m.resolved]));
  const H = 140;
  return (
    <div>
      <div className="flex items-center gap-4 text-[11px] text-brand-sub mb-2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: RECEIVED }} /> Received</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: RESOLVED }} /> Resolved</span>
      </div>
      <div className="relative flex items-end gap-3 border-b border-brand-border" style={{ height: H + 18 }}>
        {months.map((m, i) => (
          <div
            key={m.month}
            className="flex-1 flex items-end justify-center gap-[2px] h-full relative"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {[{ v: m.created, c: RECEIVED }, { v: m.resolved, c: RESOLVED }].map((b, j) => (
              <div key={j} className="flex flex-col items-center justify-end h-full" style={{ width: "min(22px, 40%)" }}>
                <span className="text-[10px] text-brand-text mb-0.5">{b.v > 0 ? b.v : ""}</span>
                <div style={{ height: (b.v / max) * H, background: b.c, borderRadius: "4px 4px 0 0", width: "100%", minHeight: b.v > 0 ? 2 : 0 }} />
              </div>
            ))}
            {hover === i && (
              <div className="no-print absolute bottom-full mb-1 z-10 rounded-md bg-white border border-brand-border shadow-md px-2 py-1 text-[11px] text-brand-text whitespace-nowrap">
                <div className="font-semibold">{MONTHS[Number(m.month.slice(5)) - 1]} {m.month.slice(0, 4)}</div>
                <div>Received: {m.created}</div>
                <div>Resolved: {m.resolved}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-1">
        {months.map((m) => (
          <div key={m.month} className="flex-1 text-center text-[10.5px] text-brand-sub">{MONTHS[Number(m.month.slice(5)) - 1]}</div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectReportContent({ projectId }: { projectId: string }) {
  const [preset, setPreset] = useState("3m");
  const [[from, to], setRange] = useState<[string, string]>(PRESETS[2].range());
  const [priorities, setPriorities] = useState<Priority[]>([]);
  // The Reports tab can open this with ?priorities=CRITICAL,HIGH already chosen.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("priorities") ?? "";
    const picked = raw.split(",").filter((p): p is Priority => PRIORITIES.some((x) => x.id === p));
    if (picked.length) setPriorities(picked);
  }, []);
  const qs = `from=${from}&to=${to}${priorities.length ? `&priorities=${priorities.join(",")}` : ""}`;
  const { data, error, isLoading } = useSWR<ReportData>(`/api/projects/${projectId}/report?${qs}`, fetcher, { keepPreviousData: true });

  if (isLoading && !data) {
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

  const priorityLabel = (id: Priority) => PRIORITIES.find((p) => p.id === id)?.label ?? id;
  const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label ?? id;
  const priorityText = data.priorities.length ? data.priorities.map(priorityLabel).join(", ") : "All priorities";
  const resolutionRate = data.sla ? metRate(data.sla.resolution) : null;

  return (
    <div className="min-h-screen bg-brand-bg">
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } body, .min-h-screen { background: #fff !important; } }`}</style>

      <div className="max-w-[920px] mx-auto px-4 sm:px-6 py-6">
        {/* Controls: only on screen, never in the PDF. */}
        <div className="no-print bg-white border border-brand-border rounded-[10px] px-3 py-2.5 mb-5 flex flex-wrap items-center gap-2">
          <select
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              const p = PRESETS.find((x) => x.id === e.target.value);
              if (p) setRange(p.range());
            }}
            className="rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
          >
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value="custom">Custom dates</option>
          </select>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5 text-[11px] text-brand-sub">
              <input type="date" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} className="rounded-lg border border-brand-border px-1.5 py-1 outline-none" />
              <span>to</span>
              <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setRange([from, e.target.value])} className="rounded-lg border border-brand-border px-1.5 py-1 outline-none" />
            </div>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] text-brand-sub mr-0.5">Priority:</span>
            {PRIORITIES.map((p) => {
              const on = priorities.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setPriorities(on ? priorities.filter((x) => x !== p.id) : [...priorities, p.id])}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold border"
                  style={{ background: on ? "#0A5A46" : "#fff", color: on ? "#fff" : "#5B6B64", borderColor: on ? "#0A5A46" : "#E1E7E4" }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => window.print()}
            className="sm:ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-dark text-white"
          >
            <Printer size={13} /> Print / Save as PDF
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-[26px] h-[26px]">
            <div className="absolute top-0 left-0 w-4 h-4 rounded-md bg-brand-dark" />
            <div className="absolute bottom-0 right-0 w-4 h-4 rounded-md bg-brand-light" />
          </div>
          <div className="text-brand-dark font-bold text-[14px]">IDEAL for Digital Transformation</div>
        </div>

        <h1 className="font-bold text-[24px] text-brand-text mt-4">{data.projectName} — Support report</h1>
        <div className="text-[12px] text-brand-sub mb-5">
          {data.period ? `${formatDateDisplay(data.period.from)} – ${formatDateDisplay(data.period.to)}` : ""} · {priorityText} · Generated {formatDateDisplay(data.generatedAt.slice(0, 10))}
        </div>

        {data.period && (
          <div className="flex gap-3 flex-wrap mb-4">
            <Kpi label="Tickets received" value={String(data.period.created)} formula="count created in the period" />
            <Kpi label="Tickets resolved" value={String(data.period.completed)} formula="count closed in the period" />
            <Kpi
              label="Average resolution"
              value={data.period.avgResolutionDays === null ? "—" : `${data.period.avgResolutionDays} d`}
              formula={`Σ working days ÷ resolved = ${data.period.resolutionDaysSum} ÷ ${data.period.completed}`}
            />
            {data.sla && (
              <Kpi
                label="Resolution SLA met"
                value={resolutionRate === null ? "—" : `${resolutionRate}%`}
                formula={`met ÷ (met + breached) × 100 = ${data.sla.resolution.met} ÷ ${data.sla.resolution.met + data.sla.resolution.breached}`}
                tone={resolutionRate !== null && resolutionRate < 80 ? "#C0524A" : "#0A5A46"}
              />
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap mb-4">
          <Kpi label="Open now" value={String(data.counts.open)} formula="not Done today" tone="#3D6EA6" />
          <Kpi label="Overdue now" value={String(data.counts.overdue)} formula="open and past the due date" tone={data.counts.overdue > 0 ? "#C0524A" : "#0A5A46"} />
          <div className="flex-[2] min-w-[240px] bg-white border border-brand-border rounded-[10px] px-4 py-3 break-inside-avoid">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11.5px] font-semibold text-brand-sub">Overall completion</span>
              <span className="text-sm font-bold text-brand-dark">{data.completionRate}%</span>
            </div>
            <ProgressBar value={data.completionRate} color="#0A5A46" />
            <div className="text-[10px] text-brand-sub font-mono mt-1.5">Done ÷ Total × 100 = {data.counts.done} ÷ {data.counts.total}</div>
          </div>
        </div>

        {data.period && data.period.months.length > 0 && (
          <Card title="Tickets received and resolved per month" formula="count per calendar month">
            <MonthChart months={data.period.months} />
          </Card>
        )}

        {data.sla && (
          <Card title="SLA performance" formula="met ÷ (met + breached) × 100 · tickets received in the period">
            <SlaRow label="Response" tally={data.sla.response} />
            <SlaRow label="Resolution" tally={data.sla.resolution} />
            {data.sla.byPriority.length > 0 && (
              <table className="w-full text-[12px] mt-2">
                <thead>
                  <tr className="text-brand-sub text-left border-b border-brand-border">
                    <th className="py-1.5 font-semibold">Priority</th>
                    <th className="py-1.5 font-semibold text-right">Met</th>
                    <th className="py-1.5 font-semibold text-right">Breached</th>
                    <th className="py-1.5 font-semibold text-right">Within time</th>
                    <th className="py-1.5 font-semibold text-right">Resolution met</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sla.byPriority.map((r) => {
                    const rate = metRate(r);
                    return (
                      <tr key={r.priority} className="border-b border-brand-border last:border-0">
                        <td className="py-1.5">{priorityLabel(r.priority)}</td>
                        <td className="py-1.5 text-right">{r.met}</td>
                        <td className="py-1.5 text-right">{r.breached}</td>
                        <td className="py-1.5 text-right">{r.pending}</td>
                        <td className="py-1.5 text-right font-semibold">{rate === null ? "—" : `${rate}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        )}

        <Card title={`Open tickets (${data.openCount})`} formula="age = working days since the ticket was received">
          {data.openTickets.length === 0 ? (
            <div className="text-[12px] text-brand-sub py-2">No open tickets.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[560px]">
                <thead>
                  <tr className="text-brand-sub text-left border-b border-brand-border">
                    <th className="py-1.5 font-semibold">Code</th>
                    <th className="py-1.5 font-semibold">Ticket</th>
                    <th className="py-1.5 font-semibold">Priority</th>
                    <th className="py-1.5 font-semibold">Status</th>
                    <th className="py-1.5 font-semibold text-right">Age</th>
                    <th className="py-1.5 font-semibold text-right">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openTickets.map((t, i) => (
                    <tr key={`${t.code}-${i}`} className="border-b border-brand-border last:border-0 align-top">
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-brand-sub whitespace-nowrap">{t.code}</td>
                      <td className="py-1.5 pr-2 text-brand-text">{t.title}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{priorityLabel(t.priority)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{statusLabel(t.status)}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">{t.ageDays} d</td>
                      <td className="py-1.5 text-right whitespace-nowrap" style={{ color: t.overdue ? "#C0524A" : undefined, fontWeight: t.overdue ? 600 : undefined }}>
                        {t.dueDate ? formatDateDisplay(t.dueDate) : "—"}{t.overdue ? " · overdue" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.openCount > data.openTickets.length && (
                <div className="text-[11px] text-brand-sub mt-1.5">Showing the oldest {data.openTickets.length} of {data.openCount}.</div>
              )}
            </div>
          )}
        </Card>

        <div className="text-[10.5px] text-brand-sub text-center mt-8">
          © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي)
        </div>
      </div>
    </div>
  );
}
