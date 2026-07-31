import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const items = await prisma.checklistItem.findMany({ where: { taskId: params.id }, orderBy: { order: "asc" } });
  return NextResponse.json(items);
}

const createSchema = z.object({ text: z.string().trim().min(1).max(300) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Text can't be empty" }, { status: 400 });
  }

  const last = await prisma.checklistItem.findFirst({ where: { taskId: params.id }, orderBy: { order: "desc" } });
  const item = await prisma.checklistItem.create({
    data: { taskId: params.id, text: parsed.data.text, order: (last?.order ?? -1) + 1 },
  });
  return NextResponse.json(item, { status: 201 });
}
