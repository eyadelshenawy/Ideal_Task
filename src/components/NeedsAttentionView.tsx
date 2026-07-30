"use client";

import { useMemo } from "react";
import type { Task, Project, AssigneeDisplay } from "@/types/models";
import { todayStr, diffDays, sortTasks } from "@/lib/taskHelpers";
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
}

export default function NeedsAttentionView({
  tasks, projectList, allTasks, canManage, getAssigneeDisplays, onEdit, onDelete, onDuplicate,
}: NeedsAttentionViewProps) {
  const today = todayStr();

  const { overdue, dueSoonHighPriority } = useMemo(() => {
    const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== "DONE");
    const dueSoonHighPriority = tasks.filter((t) => {
      if (!t.dueDate || t.status === "DONE" || t.dueDate < today) return false;
      return t.priority === "HIGH" && diffDays(today, t.dueDate) <= 3;
    });
    return {
      overdue: sortTasks(overdue, "dueDate", []),
      dueSoonHighPriority: sortTasks(dueSoonHighPriority, "dueDate", []),
    };
  }, [tasks, today]);

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
