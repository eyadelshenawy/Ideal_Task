import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { projectCreateSchema } from "@/lib/validation/project";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const projects = await prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  return NextResponse.json(projects);
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
