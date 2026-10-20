"use client";

import { useMemo } from "react";
import type { Task, Project, AssigneeDisplay, Status } from "@/types/models";
import { todayStr, sortTasks } from "@/lib/taskHelpers";
import { isOverdue, workDaysAfter, type WorkDays } from "@/lib/workdays";
import { useWorkDays } from "@/lib/useWorkDays";
import TaskListRow from "./TaskListRow";

interface NeedsAttentionViewProps {
  tasks: Task[];
  projectList: Project[];
  allTasks: Task[];
  canManage: (task: Task) => boolean;
  getAssigneeDisplays: (task: Task) => AssigneeDisplay[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onChangeStatus: (task: Task, status: Status) => void;
}

/** Overdue tasks, plus Critical/High tasks due within 3 working days — the two "needs attention" lists. */
export function needsAttention(tasks: Task[], today: string, cal: WorkDays) {
  const overdue = tasks.filter((t) => isOverdue(t, today, cal));
  const dueSoonHighPriority = tasks.filter((t) => {
    if (!t.dueDate || t.status === "DONE" || isOverdue(t, today, cal)) return false;
    return (t.priority === "CRITICAL" || t.priority === "HIGH") && workDaysAfter(today, t.dueDate, cal) <= 3;
  });
  return {
    overdue: sortTasks(overdue, "dueDate", []),
    dueSoonHighPriority: sortTasks(dueSoonHighPriority, "dueDate", []),
  };
}

export default function NeedsAttentionView({
  tasks, projectList, allTasks, canManage, getAssigneeDisplays, onEdit, onDelete, onDuplicate, onChangeStatus,
}: NeedsAttentionViewProps) {
  const today = todayStr();

  const workDays = useWorkDays();
  const { overdue, dueSoonHighPriority } = useMemo(() => needsAttention(tasks, today, workDays), [tasks, today, workDays]);

  function renderRow(task: Task) {
    return (
      <TaskListRow
        key={task.id}
        task={task}
        assignees={getAssigneeDisplays(task)}
        project={projectList.find((p) => p.id === task.projectId)}
        allTasks={allTasks}
        canManage={canManage(task)}
        onEdit={onEdit}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onChangeStatus={onChangeStatus}
      />
    );
  }

  if (overdue.length === 0 && dueSoonHighPriority.length === 0) {
    return <div className="text-center text-brand-sub text-sm py-10">Nothing needs attention right now</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {overdue.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#9A3530" }}>
            Overdue ({overdue.length})
          </div>
          {overdue.map(renderRow)}
        </div>
      )}
      {dueSoonHighPriority.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#8A5A20" }}>
            Due Soon &amp; High Priority ({dueSoonHighPriority.length})
          </div>
          {dueSoonHighPriority.map(renderRow)}
        </div>
      )}
    </div>
  );
}
