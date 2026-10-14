import type { Project, Task } from "@/types/models";
import type { BusinessCalendar } from "@/lib/businessTime";
import type { SlaConfigDto } from "@/lib/slaConfig";
import { CALENDAR_CLOCK, responseDeadline, resolutionDeadline, type SlaState } from "@/lib/sla";

/** Shape of GET /api/settings/sla/all. */
export interface SlaAll {
  default: SlaConfigDto;
  overrides: Record<string, SlaConfigDto>;
  calendar: BusinessCalendar;
}

export interface TaskSla {
  responseDue: Date;
  resolutionDue: Date;
  response: SlaState;
  resolution: SlaState;
}

/**
 * SLA status for one task, or null when the task isn't SLA-tracked (no
 * project, project not tracked, or created before the project's cutoff).
 */
export function computeTaskSla(
  task: Task,
  project: Project | undefined,
  slaAll: SlaAll,
  firstCommentAt: string | null,
  now: Date,
): TaskSla | null {
  if (!project || !project.slaTrackingEnabled) return null;
  const config = slaAll.overrides[project.id] ?? slaAll.default;
  if (config.cutoffDate && task.createdAt.slice(0, 10) < config.cutoffDate) return null;

  const clock = project.slaBusinessHours ? { calendar: slaAll.calendar } : CALENDAR_CLOCK;
  const responseDue = responseDeadline(task.priority, task.createdAt, config.targets, clock);
  const resolutionDue = resolutionDeadline(task.priority, task.createdAt, config.targets, clock);

  const state = (deadline: Date, doneAt: string | null): SlaState =>
    doneAt ? (new Date(doneAt) <= deadline ? "met" : "breached") : now <= deadline ? "pending" : "breached";

  return {
    responseDue,
    resolutionDue,
    response: state(responseDue, firstCommentAt),
    resolution: state(resolutionDue, task.completedAt),
  };
}

/** "3h 20m", "2d 4h", "45m" — compact wall-clock distance. */
export function formatDistance(ms: number): string {
  const totalMin = Math.max(0, Math.round(Math.abs(ms) / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
