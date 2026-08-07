import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireSession();
  if (error) return error;

  const fields = await prisma.customField.findMany({
    where: { projectId: params.id },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(fields);
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Field name is required").max(60),
  type: z.enum(["TEXT", "NUMBER", "SELECT"]),
  options: z.array(z.string().trim().min(1)).default([]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid field" }, { status: 400 });
  }
  const { name, type, options } = parsed.data;
  if (type === "SELECT" && options.length === 0) {
    return NextResponse.json({ error: "A dropdown field needs at least one option" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, deletedAt: true } });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const count = await prisma.customField.count({ where: { projectId: params.id } });
  const field = await prisma.customField.create({
    data: { projectId: params.id, name, type, options: type === "SELECT" ? options : [], order: count },
  });
  return NextResponse.json(field, { status: 201 });
}
