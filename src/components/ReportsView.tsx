"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { Task, Project, TeamMember } from "@/types/models";
import { todayStr, PRIORITIES } from "@/lib/taskHelpers";
import { responseSlaState, resolutionSlaState, type SlaTargets } from "@/lib/sla";
import StatCard from "./ui/StatCard";
import ProgressBar from "./ui/ProgressBar";
import Chip from "./ui/Chip";
import SlaSettingsModal from "./SlaSettingsModal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ReportsViewProps {
  tasks: Task[];
  projects: Project[];
  team: TeamMember[];
  isSuperAdmin: boolean;
}

function isOverdue(task: Task, today: string): boolean {
  return !!task.dueDate && task.dueDate < today && task.status !== "DONE";
}

export default function ReportsView({ tasks, projects, team, isSuperAdmin }: ReportsViewProps) {
  const [slaSettingsOpen, setSlaSettingsOpen] = useState(false);
  const today = todayStr();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: firstCommentAt } = useSWR<Record<string, string>>("/api/reports/sla", fetcher);
  const { data: slaConfig } = useSWR<{ targets: SlaTargets; cutoffDate: string | null }>("/api/settings/sla", fetcher);

  const sla = useMemo(() => {
    if (!firstCommentAt || !slaConfig) return null;
    const now = new Date();
    const inScope = slaConfig.cutoffDate
      ? tasks.filter((t) => t.createdAt.slice(0, 10) >= slaConfig.cutoffDate!)
      : tasks;
    const rows = inScope.map((t) => ({
      task: t,
      response: responseSlaState(t.priority, t.createdAt, firstCommentAt[t.id] ?? null, now, slaConfig.targets),
      resolution: resolutionSlaState(t.priority, t.createdAt, t.completedAt, now, slaConfig.targets),
    }));
    const decided = (state: "response" | "resolution") => rows.filter((r) => r[state] !== "pending");
    const rate = (state: "response" | "resolution") => {
      const d = decided(state);
      if (d.length === 0) return null;
      return Math.round((d.filter((r) => r[state] === "met").length / d.length) * 100);
    };
    const breached = rows.filter((r) => r.response === "breached" || r.resolution === "breached");
    return { responseRate: rate("response"), resolutionRate: rate("resolution"), breached, excludedCount: tasks.length - inScope.length };
  }, [tasks, firstCommentAt, slaConfig]);

  const overall = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "DONE").length;
    const inProgress = tasks.filter((t) => t.status === "INPROGRESS").length;
    const overdue = tasks.filter((t) => isOverdue(t, today)).length;
    const createdLast7 = tasks.filter((t) => t.createdAt >= sevenDaysAgo).length;
    const completedLast7 = tasks.filter((t) => t.status === "DONE" && t.updatedAt >= sevenDaysAgo).length;
    return {
      total, done, inProgress, overdue,
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      createdLast7, completedLast7,
    };
  }, [tasks, today, sevenDaysAgo]);

  const perProject = useMemo(() => {
    const rows = projects.map((p) => {
      const projectTasks = tasks.filter((t) => t.projectId === p.id);
      const total = projectTasks.length;
      const done = projectTasks.filter((t) => t.status === "DONE").length;
      const overdue = projectTasks.filter((t) => isOverdue(t, today)).length;
      return { id: p.id, name: p.name, total, done, overdue, completionRate: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
    const unassignedTasks = tasks.filter((t) => !t.projectId);
    if (unassignedTasks.length > 0) {
      const done = unassignedTasks.filter((t) => t.status === "DONE").length;
      const overdue = unassignedTasks.filter((t) => isOverdue(t, today)).length;
      rows.push({
        id: "__none__", name: "No project", total: unassignedTasks.length, done, overdue,
        completionRate: Math.round((done / unassignedTasks.length) * 100),
      });
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [tasks, projects, today]);

  // Open (non-Done) work per person, sorted heaviest-first — a quick "who's
  // overloaded, who has room" read. A task with multiple assignees counts
  // toward each of them, same as it appears on each of their boards.
  const workload = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "DONE");
    const rows = team.filter((m) => m.active).map((m) => {
      const mine = open.filter((t) => t.assigneeIds.includes(m.id));
      const overdue = mine.filter((t) => isOverdue(t, today)).length;
      const highPriority = mine.filter((t) => t.priority === "HIGH").length;
      return { id: m.id, name: m.name, total: mine.length, overdue, highPriority };
    });
    const maxTotal = Math.max(1, ...rows.map((r) => r.total));
    return rows.sort((a, b) => b.total - a.total).map((r) => ({ ...r, barPct: Math.round((r.total / maxTotal) * 100) }));
  }, [tasks, team, today]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs font-bold text-brand-sub uppercase tracking-wide mb-2">Overview</div>
        <div className="flex gap-2 flex-wrap">
          <StatCard label="Total" value={overall.total} color="#0A5A46" />
          <StatCard label="In Progress" value={overall.inProgress} color="#82B478" />
          <StatCard label="Overdue" value={overall.overdue} color="#C4443D" />
          <StatCard label="Done" value={overall.done} color="#0A5A46" />
          <StatCard label="Completion Rate" value={`${overall.completionRate}%`} color="#3E7C7C" />
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-brand-sub uppercase tracking-wide mb-2">Last 7 Days</div>
        <div className="flex gap-2 flex-wrap">
          <StatCard label="Tasks Created" value={overall.createdLast7} color="#3D6EA6" />
          <StatCard label="Tasks Completed" value={overall.completedLast7} color="#0A5A46" />
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-brand-sub uppercase tracking-wide mb-2">By Project</div>
        <div className="flex flex-col gap-2">
          {perProject.length === 0 && (
            <div className="text-sm text-brand-sub py-6 text-center">No tasks yet</div>
          )}
          {perProject.map((row) => (
            <div key={row.id} className="bg-white border border-brand-border rounded-[10px] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-[13.5px] text-brand-text">{row.name}</span>
                <div className="flex items-center gap-2 text-[11.5px] text-brand-sub flex-shrink-0">
                  <span>{row.done}/{row.total} done</span>
                  {row.overdue > 0 && <span className="text-[#C4443D] font-semibold">{row.overdue} overdue</span>}
                  <span className="font-semibold text-brand-text">{row.completionRate}%</span>
                </div>
              </div>
              <ProgressBar value={row.completionRate} color="#0A5A46" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold text-brand-sub uppercase tracking-wide mb-2">Team Workload</div>
        <div className="flex flex-col gap-2">
          {workload.length === 0 && (
            <div className="text-sm text-brand-sub py-6 text-center">No active team members yet</div>
          )}
          {workload.map((row) => (
            <div key={row.id} className="bg-white border border-brand-border rounded-[10px] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-[13.5px] text-brand-text">{row.name}</span>
                <div className="flex items-center gap-2 text-[11.5px] text-brand-sub flex-shrink-0">
                  {row.highPriority > 0 && <span className="text-[#C4443D]">{row.highPriority} high priority</span>}
                  {row.overdue > 0 && <span className="text-[#C4443D] font-semibold">{row.overdue} overdue</span>}
                  <span className="font-semibold text-brand-text">{row.total} open</span>
                </div>
              </div>
              <ProgressBar value={row.barPct} color="#3D6EA6" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-brand-sub uppercase tracking-wide">SLA</div>
          {isSuperAdmin && (
            <button onClick={() => setSlaSettingsOpen(true)} className="text-[11px] text-brand-dark underline">
              Edit targets
            </button>
          )}
        </div>
        {slaSettingsOpen && <SlaSettingsModal onClose={() => setSlaSettingsOpen(false)} />}
        {!sla ? (
          <div className="text-sm text-brand-sub py-6 text-center">Loading…</div>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap mb-2">
              <StatCard label="Response SLA met" value={sla.responseRate === null ? "—" : `${sla.responseRate}%`} color="#3D6EA6" />
              <StatCard label="Resolution SLA met" value={sla.resolutionRate === null ? "—" : `${sla.resolutionRate}%`} color="#0A5A46" />
              <StatCard label="Currently breached" value={sla.breached.length} color="#C4443D" />
            </div>
            {sla.excludedCount > 0 && (
              <div className="text-[11px] text-brand-sub mb-2">
                {sla.excludedCount} task{sla.excludedCount === 1 ? "" : "s"} created before the SLA cutoff date are excluded from these numbers.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {sla.breached.length === 0 && (
                <div className="text-sm text-brand-sub py-4 text-center">Nothing currently breaching its SLA target</div>
              )}
              {sla.breached.map(({ task, response, resolution }) => (
                <div key={task.id} className="bg-white border border-brand-border rounded-[10px] px-3 py-2 flex items-center gap-2 flex-wrap">
                  {task.code && <span className="font-mono text-[11px] text-brand-sub">{task.code}</span>}
                  <span className="text-[12.5px] text-brand-text flex-1 min-w-[140px]">{task.title}</span>
                  <Chip small style={{ background: "#EEF2F0", color: "#5B6B64" }}>{PRIORITIES.find((p) => p.id === task.priority)?.label}</Chip>
                  {response === "breached" && <Chip small style={{ background: "#FBE7E5", color: "#9A3530" }}>Response overdue</Chip>}
                  {resolution === "breached" && <Chip small style={{ background: "#FBE7E5", color: "#9A3530" }}>Resolution overdue</Chip>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
