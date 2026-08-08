import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";

const applySchema = z.object({ templateId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const parsed = applySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const template = await prisma.checklistTemplate.findUnique({
    where: { id: parsed.data.templateId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const last = await prisma.checklistItem.findFirst({ where: { taskId: params.id }, orderBy: { order: "desc" } });
  let nextOrder = (last?.order ?? -1) + 1;

  await prisma.checklistItem.createMany({
    data: template.items.map((item) => ({ taskId: params.id, text: item.text, order: nextOrder++ })),
  });

  const items = await prisma.checklistItem.findMany({ where: { taskId: params.id }, orderBy: { order: "asc" } });
  return NextResponse.json(items, { status: 201 });
}
