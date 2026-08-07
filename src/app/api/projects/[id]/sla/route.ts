import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { dateStrToUTC } from "@/lib/serverDates";
import { SLA_DEFAULT_SENTINEL, loadSlaConfig } from "@/lib/slaConfig";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireSession();
  if (error) return error;
  return NextResponse.json(await loadSlaConfig(params.id));
}

const slaConfigSchema = z.object({
  targets: z.object({
    HIGH: z.object({ responseHours: z.number().min(1).max(720), resolutionDays: z.number().min(1).max(365) }),
    MEDIUM: z.object({ responseHours: z.number().min(1).max(720), resolutionDays: z.number().min(1).max(365) }),
    LOW: z.object({ responseHours: z.number().min(1).max(720), resolutionDays: z.number().min(1).max(365) }),
  }),
  cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  if (params.id === SLA_DEFAULT_SENTINEL) {
    return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  }

  const parsed = slaConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid SLA settings" }, { status: 400 });
  }
  const { targets, cutoffDate } = parsed.data;
  const data = {
    highResponseHours: targets.HIGH.responseHours,
    highResolutionDays: targets.HIGH.resolutionDays,
    mediumResponseHours: targets.MEDIUM.responseHours,
    mediumResolutionDays: targets.MEDIUM.resolutionDays,
    lowResponseHours: targets.LOW.responseHours,
    lowResolutionDays: targets.LOW.resolutionDays,
    cutoffDate: dateStrToUTC(cutoffDate),
  };

  await prisma.slaConfig.upsert({
    where: { projectId: params.id },
    create: { projectId: params.id, ...data },
    update: data,
  });

  return NextResponse.json(await loadSlaConfig(params.id));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await prisma.slaConfig.deleteMany({ where: { projectId: params.id } });
  return NextResponse.json({ ok: true });
}
