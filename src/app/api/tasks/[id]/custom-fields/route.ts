import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const task = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true } });
  if (!task?.projectId) return NextResponse.json({ fields: [], values: {} });

  const [fields, values] = await Promise.all([
    prisma.customField.findMany({ where: { projectId: task.projectId }, orderBy: { order: "asc" } }),
    prisma.taskCustomFieldValue.findMany({ where: { taskId: params.id } }),
  ]);

  return NextResponse.json({
    fields,
    values: Object.fromEntries(values.map((v) => [v.fieldId, v.value])),
  });
}

const putSchema = z.object({ values: z.record(z.string()) });

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const entries = Object.entries(parsed.data.values);
  await Promise.all(
    entries.map(([fieldId, value]) =>
      value.trim() === ""
        ? prisma.taskCustomFieldValue.deleteMany({ where: { taskId: params.id, fieldId } })
        : prisma.taskCustomFieldValue.upsert({
            where: { taskId_fieldId: { taskId: params.id, fieldId } },
            create: { taskId: params.id, fieldId, value },
            update: { value },
          })
    )
  );

  return NextResponse.json({ ok: true });
}
