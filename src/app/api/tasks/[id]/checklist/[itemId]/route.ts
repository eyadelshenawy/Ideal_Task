import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";

const updateSchema = z.object({
  done: z.boolean().optional(),
  text: z.string().trim().min(1).max(300).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const item = await prisma.checklistItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.taskId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.checklistItem.update({
    where: { id: params.itemId },
    data: {
      ...(parsed.data.done !== undefined ? { done: parsed.data.done } : {}),
      ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const item = await prisma.checklistItem.findUnique({ where: { id: params.itemId } });
  if (!item || item.taskId !== params.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.checklistItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ ok: true });
}
