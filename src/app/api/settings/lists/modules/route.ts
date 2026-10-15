import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40).refine((n) => !n.includes(","), "Names can't contain a comma"),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid module" }, { status: 400 });
  const { name } = parsed.data;

  const clash = await prisma.moduleOption.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (clash) return NextResponse.json({ error: `"${clash.name}" is already in the list` }, { status: 400 });

  const max = await prisma.moduleOption.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.moduleOption.create({
    data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    select: { id: true, name: true, sortOrder: true, active: true },
  });
  logAudit(session.user.id, `Added module "${name}"`);
  return NextResponse.json(row);
}
