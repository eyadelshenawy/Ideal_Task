import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { projectCreateSchema } from "@/lib/validation/project";
import { logAudit } from "@/lib/audit";
import { loadDefaultSlaConfig, loadAllProjectSlaOverrides } from "@/lib/slaConfig";
import type { Priority } from "@/types/models";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  // Templates are hidden from the main dashboard by default — everything
  // that just wants "the live projects" (the dashboard, filter dropdowns,
  // reports) gets the default response. The Projects modal opts in with
  // ?includeTemplates=true so it can render its own Templates section
  // alongside the active list.
  const includeTemplates = req.nextUrl.searchParams.get("includeTemplates") === "true";
  const [projects, defaultSla, overrides] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null, ...(includeTemplates ? {} : { isTemplate: false }) },
      orderBy: { name: "asc" },
    }),
    loadDefaultSlaConfig(),
    loadAllProjectSlaOverrides(),
  ]);

  // Bundle each SLA-tracked project's resolution-days-per-priority into the
  // response so the Task modal can prefill Duration from SLA without a second
  // round-trip. Non-SLA projects get `sla: null`. Per-project override wins
  // over the org-wide default.
  const enriched = projects.map((p) => {
    if (!p.slaTrackingEnabled) return { ...p, sla: null };
    const targets = overrides[p.id]?.targets ?? defaultSla.targets;
    const sla: Record<Priority, number> = {
      CRITICAL: targets.CRITICAL.resolutionDays,
      HIGH: targets.HIGH.resolutionDays,
      MEDIUM: targets.MEDIUM.resolutionDays,
      LOW: targets.LOW.resolutionDays,
    };
    return { ...p, sla };
  });
  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = projectCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid project" }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: { name: parsed.data.name, code: parsed.data.code, slaTrackingEnabled: parsed.data.slaTrackingEnabled ?? false },
    });
    logAudit(session.user.id, `Created project "${project.name}" (${project.code})`);
    return NextResponse.json(project, { status: 201 });
  } catch {
    return NextResponse.json({ error: "That project code is already in use" }, { status: 400 });
  }
}
