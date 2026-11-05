import type { Priority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadDefaultSlaConfig, loadSlaConfig } from "@/lib/slaConfig";

/**
 * Working days the SLA allows to resolve a ticket of this priority in this
 * project, or null when the project doesn't track SLA.
 *   Duration = SLA resolution days for the priority (project override, else default)
 */
export async function slaResolutionDays(projectId: string | null, priority: Priority): Promise<number | null> {
  if (!projectId) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { slaTrackingEnabled: true } });
  if (!project?.slaTrackingEnabled) return null;
  const config = (await loadSlaConfig(projectId)) ?? (await loadDefaultSlaConfig());
  return config.targets[priority]?.resolutionDays ?? null;
}

/**
 * A start date with no Duration and no Due in an SLA project: take the
 * Duration from the SLA, so the Due Date can be worked out from the start
 * (skipping weekends and holidays). Anything the user filled in wins.
 */
export async function withSlaDuration<T extends { startDate: string | null; dueDate: string | null; durationDays: number | null }>(
  dates: T,
  projectId: string | null,
  priority: Priority,
): Promise<T> {
  if (!dates.startDate || dates.dueDate || dates.durationDays) return dates;
  const days = await slaResolutionDays(projectId, priority);
  return days ? { ...dates, durationDays: days } : dates;
}
