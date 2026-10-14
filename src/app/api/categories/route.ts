import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, sortOrder: true },
  });
  return NextResponse.json(rows);
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  parentId: z.string().nullable().default(null),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid category" }, { status: 400 });
  const { name, parentId } = parsed.data;

  let parentName: string | null = null;
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { parentId: true, name: true } });
    if (!parent || parent.parentId) return NextResponse.json({ error: "Subcategories can only go one level deep" }, { status: 400 });
    parentName = parent.name;
  }

  const clash = await prisma.category.findFirst({ where: { parentId, name: { equals: name, mode: "insensitive" } } });
  if (clash) return NextResponse.json({ error: "That name already exists here" }, { status: 400 });

  const max = await prisma.category.aggregate({ where: { parentId }, _max: { sortOrder: true } });
  const row = await prisma.category.create({
    data: { name, parentId, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    select: { id: true, name: true, parentId: true, sortOrder: true },
  });
  logAudit(session.user.id, parentName ? `Added subcategory "${name}" under "${parentName}"` : `Added category "${name}"`);
  return NextResponse.json(row);
}
