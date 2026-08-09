import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { visibleTasksWhere } from "@/lib/taskVisibility";

// Feeds the Excel export's Comments/Attachments/Checklist columns. Kept as
// its own on-demand endpoint (rather than folded into the main task list)
// since these fields are heavy and only needed at export time — the same
// reasoning as ShareTaskDetailModal fetching full detail per task instead
// of the list endpoint carrying it for every task, every load.
const bodySchema = z.object({ taskIds: z.array(z.string()).min(1).max(2000) });

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "taskIds is required" }, { status: 400 });
  }

  const access = await getUserAccess(session);
  const tasks = await prisma.task.findMany({
    where: { id: { in: parsed.data.taskIds }, ...visibleTasksWhere(session.user.id, access.isSuperAdmin, access.administeredProjectIds) },
    select: {
      id: true,
      events: {
        where: { type: "COMMENT" },
        orderBy: { createdAt: "asc" },
        select: { message: true, createdAt: true, author: { select: { name: true } } },
      },
      attachments: { orderBy: { createdAt: "asc" }, select: { fileName: true } },
      checklistItems: { orderBy: { order: "asc" }, select: { text: true, done: true } },
    },
  });

  const result: Record<string, { comments: string; attachments: string; checklist: string }> = {};
  for (const t of tasks) {
    result[t.id] = {
      comments: t.events
        .map((e) => `[${e.createdAt.toISOString().slice(0, 10)}] ${e.author?.name ?? "Someone"}: ${e.message}`)
        .join("\n"),
      attachments: t.attachments.map((a) => a.fileName).join(", "),
      checklist: t.checklistItems.map((c) => `[${c.done ? "x" : " "}] ${c.text}`).join("\n"),
    };
  }
  return NextResponse.json(result);
}
