import { prisma } from "@/lib/prisma";
import { utcToDateStr } from "@/lib/serverDates";
import { DEFAULT_SLA_TARGETS, type SlaTargets } from "@/lib/sla";

export const SLA_DEFAULT_SENTINEL = "__default__";

export interface SlaConfigDto {
  targets: SlaTargets;
  cutoffDate: string | null;
}

function toDto(row: {
  highResponseHours: number; highResolutionDays: number;
  mediumResponseHours: number; mediumResolutionDays: number;
  lowResponseHours: number; lowResolutionDays: number;
  cutoffDate: Date | null;
}): SlaConfigDto {
  return {
    targets: {
      HIGH: { responseHours: row.highResponseHours, resolutionDays: row.highResolutionDays },
      MEDIUM: { responseHours: row.mediumResponseHours, resolutionDays: row.mediumResolutionDays },
      LOW: { responseHours: row.lowResponseHours, resolutionDays: row.lowResolutionDays },
    },
    cutoffDate: utcToDateStr(row.cutoffDate),
  };
}

export async function loadSlaConfig(projectId: string): Promise<SlaConfigDto | null> {
  const row = await prisma.slaConfig.findUnique({ where: { projectId } });
  return row ? toDto(row) : null;
}

export async function loadDefaultSlaConfig(): Promise<SlaConfigDto> {
  const row = await prisma.slaConfig.findUnique({ where: { projectId: SLA_DEFAULT_SENTINEL } });
  return row ? toDto(row) : { targets: DEFAULT_SLA_TARGETS, cutoffDate: null };
}

/** Every per-project override, keyed by projectId (the default sentinel row excluded). */
export async function loadAllProjectSlaOverrides(): Promise<Record<string, SlaConfigDto>> {
  const rows = await prisma.slaConfig.findMany({ where: { projectId: { not: SLA_DEFAULT_SENTINEL } } });
  return Object.fromEntries(rows.map((r) => [r.projectId, toDto(r)]));
}
