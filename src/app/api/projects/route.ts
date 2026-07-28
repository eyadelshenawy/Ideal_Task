import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { projectCreateSchema } from "@/lib/validation/project";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const projects = await prisma.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = projectCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid project" }, { status: 400 });
  }

  const project = await prisma.project.create({ data: { name: parsed.data.name } });
  return NextResponse.json(project, { status: 201 });
}
