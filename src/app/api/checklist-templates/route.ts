import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, requireSuperAdmin } from "@/lib/permissions";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const templates = await prisma.checklistTemplate.findMany({
    include: { items: { orderBy: { order: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(templates);
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  items: z.array(z.string().trim().min(1)).min(1, "Add at least one step"),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid template" }, { status: 400 });
  }

  const template = await prisma.checklistTemplate.create({
    data: {
      name: parsed.data.name,
      items: { create: parsed.data.items.map((text, order) => ({ text, order })) },
    },
    include: { items: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(template, { status: 201 });
}
