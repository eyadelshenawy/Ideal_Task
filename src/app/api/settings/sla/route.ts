import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { DEFAULT_SLA_TARGETS, type SlaTargets } from "@/lib/sla";
import { dateStrToUTC, utcToDateStr } from "@/lib/serverDates";

interface SlaConfigResponse {
  targets: SlaTargets;
  cutoffDate: string | null;
}

async function loadConfig(): Promise<SlaConfigResponse> {
  const row = await prisma.slaConfig.findUnique({ where: { id: "default" } });
  if (!row) return { targets: DEFAULT_SLA_TARGETS, cutoffDate: null };
  return {
    targets: {
      HIGH: { responseHours: row.highResponseHours, resolutionDays: row.highResolutionDays },
      MEDIUM: { responseHours: row.mediumResponseHours, resolutionDays: row.mediumResolutionDays },
      LOW: { responseHours: row.lowResponseHours, resolutionDays: row.lowResolutionDays },
    },
    cutoffDate: utcToDateStr(row.cutoffDate),
  };
}

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  return NextResponse.json(await loadConfig());
}

const slaConfigSchema = z.object({
  targets: z.object({
    HIGH: z.object({ responseHours: z.number().min(1).max(720), resolutionDays: z.number().min(1).max(365) }),
    MEDIUM: z.object({ responseHours: z.number().min(1).max(720), resolutionDays: z.number().min(1).max(365) }),
    LOW: z.object({ responseHours: z.number().min(1).max(720), resolutionDays: z.number().min(1).max(365) }),
  }),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function PUT(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = slaConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid SLA settings" }, { status: 400 });
  }
  const { targets, cutoffDate } = parsed.data;

  await prisma.slaConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      highResponseHours: targets.HIGH.responseHours,
      highResolutionDays: targets.HIGH.resolutionDays,
      mediumResponseHours: targets.MEDIUM.responseHours,
      mediumResolutionDays: targets.MEDIUM.resolutionDays,
      lowResponseHours: targets.LOW.responseHours,
      lowResolutionDays: targets.LOW.resolutionDays,
      cutoffDate: dateStrToUTC(cutoffDate),
    },
    update: {
      highResponseHours: targets.HIGH.responseHours,
      highResolutionDays: targets.HIGH.resolutionDays,
      mediumResponseHours: targets.MEDIUM.responseHours,
      mediumResolutionDays: targets.MEDIUM.resolutionDays,
      lowResponseHours: targets.LOW.responseHours,
      lowResolutionDays: targets.LOW.resolutionDays,
      cutoffDate: dateStrToUTC(cutoffDate),
    },
  });

  return NextResponse.json(await loadConfig());
}
