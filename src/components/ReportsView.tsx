"use client";

import { useMemo } from "react";
import type { Task, Project } from "@/types/models";
import { todayStr } from "@/lib/taskHelpers";
import StatCard from "./ui/StatCard";
import ProgressBar from "./ui/ProgressBar";

interface ReportsViewProps {
  tasks: Task[];
  projects: Project[];
}

function isOverdue(task: Task, today: string): boolean {
  return !!task.dueDate && task.dueDate < today && task.status !== "DONE";
}

export default function ReportsView({ tasks, projects }: ReportsViewProps) {
  const today = todayStr();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

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
    </div>
  );
}
