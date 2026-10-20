"use client";

import type { ReactNode } from "react";
import type { Insights } from "@/lib/reportInsights";

export type InsightsTab = "customers" | "sla" | "team" | "time" | "quality";

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
const avg = (sum: number, count: number, unit: string) => (count > 0 ? `${(Math.round((sum / count) * 10) / 10).toString()} ${unit}` : "—");
const num = (n: number) => (Math.round(n * 10) / 10).toString();

function Card({ n, title, formula, children, wide }: { n: number; title: string; formula: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`bg-white border border-brand-border rounded-xl p-3.5 ${wide ? "lg:col-span-2" : ""}`}>
      <div className="font-bold text-[13px] text-brand-text">{n} · {title}</div>
      <div className="font-mono text-[10.5px] text-brand-sub mb-2.5">{formula}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-brand-sub py-3">Nothing in this period yet.</div>;
}

function MonthTable({ rows, months, cell, total }: {
  rows: { key: string; name: string }[];
  months: Insights["months"];
  cell: (rowKey: string, month: string) => ReactNode;
  total?: (rowKey: string) => ReactNode;
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="text-brand-sub">
            <th className="text-left font-semibold py-1 pr-2">Customer</th>
            {months.map((m) => <th key={m.key} className="text-right font-semibold py-1 px-1.5 whitespace-nowrap">{m.label.slice(0, 3)}</th>)}
            {total && <th className="text-right font-semibold py-1 pl-1.5">Total</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-[#EEF2F0]">
              <td className="py-1 pr-2 text-brand-text whitespace-nowrap">{r.name}</td>
              {months.map((m) => <td key={m.key} className="text-right py-1 px-1.5">{cell(r.key, m.key)}</td>)}
              {total && <td className="text-right py-1 pl-1.5 font-semibold">{total(r.key)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bars({ rows, color }: { rows: { name: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0 || rows.every((r) => r.count === 0)) return <Empty />;
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 text-[11.5px]">
          <span className="w-[110px] truncate text-brand-text" title={r.name}>{r.name}</span>
          <span className="h-2.5 rounded" style={{ width: `${(r.count / max) * 60}%`, minWidth: r.count ? 4 : 0, background: color }} />
          <span className="text-brand-sub">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

export default function InsightsReports({ tab, data }: { tab: InsightsTab; data: Insights }) {
  const { months } = data;

  if (tab === "customers") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card n={1} title="Tickets per customer per month" formula="count of tickets created in the month" wide>
          <MonthTable
            rows={data.ticketsPerCustomer.map((r) => ({ key: r.projectId, name: r.name }))}
            months={months}
            cell={(k, m) => data.ticketsPerCustomer.find((r) => r.projectId === k)!.counts[m] || ""}
            total={(k) => data.ticketsPerCustomer.find((r) => r.projectId === k)!.total}
          />
        </Card>
        <Card n={5} title="Where problems come from — modules (top 5)" formula="count of tickets created in the period, per module">
          <Bars rows={data.topModules} color="#0A5A46" />
        </Card>
        <Card n={5} title="Where problems come from — categories (top 5)" formula="count of tickets created in the period, per category">
          <Bars rows={data.topCategories} color="#82B478" />
        </Card>
      </div>
    );
  }

  if (tab === "sla") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card n={2} title="Resolution SLA met per customer per month" formula="met ÷ (met + breached) × 100" wide>
          <MonthTable
            rows={data.slaPerCustomer.map((r) => ({ key: r.projectId, name: r.name }))}
            months={months}
            cell={(k, m) => {
              const r = data.slaPerCustomer.find((x) => x.projectId === k)!;
              const met = r.met[m] ?? 0, breached = r.breached[m] ?? 0;
              if (met + breached === 0) return "";
              const v = Math.round((met / (met + breached)) * 100);
              return <span style={{ color: v < 80 ? "#9A3530" : undefined }} title={`${met} met, ${breached} breached`}>{v}%</span>;
            }}
          />
          <div className="text-[10.5px] text-brand-sub mt-1.5">SLA-tracked projects only, by the month a ticket was created; tickets still within their time aren&apos;t counted yet.</div>
        </Card>
        <Card n={3} title="Average response and resolution time" formula="sum of hours (or working days) ÷ number of tickets">
          <table className="w-full text-[11.5px]">
            <thead><tr className="text-brand-sub"><th className="text-left font-semibold py-1">Priority</th><th className="text-right font-semibold">Response</th><th className="text-right font-semibold">Resolution</th></tr></thead>
            <tbody>
              {data.speed.map((s) => (
                <tr key={s.priority} className="border-t border-[#EEF2F0]">
                  <td className="py-1">{s.label}</td>
                  <td className="text-right" title={`${s.responseCount} tickets`}>{avg(s.responseHours, s.responseCount, "h")}</td>
                  <td className="text-right" title={`${s.resolutionCount} tickets`}>{avg(s.resolutionDays, s.resolutionCount, "d")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10.5px] text-brand-sub mt-1.5">Response = created → first comment (hours, calendar time). Resolution = created → Done (working days).</div>
        </Card>
        <Card n={4} title="Age of open tickets" formula="working days from created date to today">
          <Bars rows={data.ageing.map((a) => ({ name: a.label, count: a.count }))} color="#E0892E" />
        </Card>
      </div>
    );
  }

  if (tab === "team") {
    return (
      <Card n={7} title="Team performance" formula="average resolution = resolution working days ÷ closed · overdue % = overdue ÷ open × 100">
        {data.team.length === 0 ? <Empty /> : (
          <table className="w-full text-[11.5px]">
            <thead><tr className="text-brand-sub"><th className="text-left font-semibold py-1">Person</th><th className="text-right font-semibold">Closed</th><th className="text-right font-semibold">Avg resolution</th><th className="text-right font-semibold">Open now</th><th className="text-right font-semibold">Overdue %</th></tr></thead>
            <tbody>
              {data.team.map((r) => (
                <tr key={r.id} className="border-t border-[#EEF2F0]">
                  <td className="py-1">{r.name}</td>
                  <td className="text-right">{r.closed}</td>
                  <td className="text-right">{avg(r.resolutionDays, r.closed, "d")}</td>
                  <td className="text-right">{r.open}</td>
                  <td className="text-right" style={{ color: r.open && r.overdue / r.open > 0.25 ? "#9A3530" : undefined }} title={`${r.overdue} of ${r.open} overdue`}>{pct(r.overdue, r.open)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    );
  }

  if (tab === "time") {
    return (
      <Card n={6} title="Hours logged per customer per month" formula="sum of hours logged in the month">
        <MonthTable
          rows={data.hoursPerCustomer.map((r) => ({ key: r.projectId, name: r.name }))}
          months={months}
          cell={(k, m) => { const h = data.hoursPerCustomer.find((r) => r.projectId === k)!.hours[m]; return h ? num(h) : ""; }}
          total={(k) => num(data.hoursPerCustomer.find((r) => r.projectId === k)!.total)}
        />
        <div className="text-[10.5px] text-brand-sub mt-1.5">Use Export to Excel above for an invoice-ready sheet.</div>
      </Card>
    );
  }

  // quality
  const maxWeek = Math.max(1, ...data.weeks.map((w) => Math.max(w.opened, w.closed)));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card n={8} title="Opened vs closed per week" formula="backlog change = opened − closed">
        <div className="flex items-end gap-1.5 h-[120px] pt-1">
          {data.weeks.map((w) => (
            <div key={w.week} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`Week of ${w.week}: ${w.opened} opened, ${w.closed} closed`}>
              <div className="flex items-end gap-0.5 w-full h-full">
                <div className="flex-1 rounded-t" style={{ height: `${(w.opened / maxWeek) * 100}%`, background: "#82B478" }} />
                <div className="flex-1 rounded-t" style={{ height: `${(w.closed / maxWeek) * 100}%`, background: "#0A5A46" }} />
              </div>
              <div className="text-[9px] text-brand-sub">{w.week.slice(8)}/{w.week.slice(5, 7)}</div>
            </div>
          ))}
        </div>
        <div className="text-[10.5px] text-brand-sub mt-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: "#82B478" }} />Opened
          <span className="inline-block w-2.5 h-2.5 rounded-sm align-middle ml-3 mr-1" style={{ background: "#0A5A46" }} />Closed
          <span className="ml-3">· last 12 weeks, each starting Sunday</span>
        </div>
      </Card>
      <Card n={9} title="Reopened tickets" formula="reopened ÷ closed × 100">
        <div className="text-[28px] font-extrabold text-brand-text leading-tight">{pct(data.reopenedCount, data.closedCount)}</div>
        <div className="text-[11.5px] text-brand-sub">{data.reopenedCount} of {data.closedCount} tickets closed in the period were moved back from Done.</div>
      </Card>
    </div>
  );
}
