import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getR2DownloadUrl } from "@/lib/r2";
import { TO_CUSTOMER_PREFIX, FROM_CUSTOMER_PREFIX } from "@/lib/customerThread";
import { matchAttachmentLines } from "@/lib/attachmentMatcher";

// Public, unauthenticated — same token gate as the project-level share
// endpoint. Deliberately shows the customer thread only: any comment
// explicitly sent to the customer via "Email customer" or replied by the
// customer stays visible; every internal team comment stays hidden. The
// team is still never named — team-side messages read as "Team" only.
// Attachments are filtered the same way — only files referenced by a
// customer-thread message (via its "📎 name" line) are exposed. Anything
// the team uploaded through the internal attachments panel stays hidden.
export async function GET(_req: Request, { params }: { params: { token: string; taskId: string } }) {
  const project = await prisma.project.findUnique({
    where: { shareToken: params.token },
    select: { id: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
    select: {
      id: true, projectId: true, deletedAt: true,
      code: true, title: true, description: true, status: true, dueDate: true, progress: true, isMilestone: true,
      events: {
        where: {
          type: "COMMENT",
          OR: [{ message: { startsWith: TO_CUSTOMER_PREFIX } }, { message: { startsWith: FROM_CUSTOMER_PREFIX } }],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, message: true, createdAt: true },
      },
      attachments: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, fileKey: true, fileSize: true, createdAt: true } },
    },
  });
  // Deliberately 404 (not 403) whether the task doesn't exist, is deleted,
  // or just belongs to a different project — never confirm a task id's
  // existence to someone who only has this project's link.
  if (!task || task.deletedAt || task.projectId !== project.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Which attachment rows were referenced by a "📎 name" line inside a
  // customer-thread message — these are the only files the customer is
  // meant to see. Internal-only uploads (via the team's attachments panel,
  // never handed off to the customer) don't show up in any thread message
  // and stay hidden here.
  const eventShapes = task.events.map((e) => ({ id: e.id, message: e.message, createdAt: e.createdAt.toISOString() }));
  const attachmentShapes = task.attachments.map((a) => ({ id: a.id, fileName: a.fileName, createdAt: a.createdAt.toISOString() }));
  const matched = matchAttachmentLines(eventShapes, attachmentShapes);
  const referencedIds = new Set(matched.values());

  const attachments = await Promise.all(
    task.attachments
      .filter((a) => referencedIds.has(a.id))
      .map(async (a) => ({
        id: a.id,
        fileName: a.fileName,
        fileSize: a.fileSize,
        createdAt: a.createdAt.toISOString(),
        url: await getR2DownloadUrl(a.fileKey, a.fileName).catch(() => null),
      }))
  );

  const comments = task.events.map((e) => {
    const fromTeam = e.message.startsWith(TO_CUSTOMER_PREFIX);
    return {
      id: e.id,
      from: fromTeam ? "team" : "customer",
      message: fromTeam ? e.message.slice(TO_CUSTOMER_PREFIX.length) : e.message.slice(FROM_CUSTOMER_PREFIX.length),
      createdAt: e.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    code: task.code,
    title: task.title,
    description: task.description,
    status: task.status,
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
    progress: task.progress,
    isMilestone: task.isMilestone,
    comments,
    attachments: attachments.filter((a) => a.url !== null),
  });
}
