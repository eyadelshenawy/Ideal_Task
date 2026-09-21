import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess, getUserAccess } from "@/lib/permissions";
import { getR2DownloadUrl, deleteFromR2 } from "@/lib/r2";
import { logActivity } from "@/lib/activity";

export async function GET(_req: NextRequest, { params }: { params: { id: string; attachmentId: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const attachment = await prisma.attachment.findUnique({ where: { id: params.attachmentId } });
  if (!attachment || attachment.taskId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await getR2DownloadUrl(attachment.fileKey, attachment.fileName);
  return NextResponse.json({ url });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; attachmentId: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  const attachment = await prisma.attachment.findUnique({ where: { id: params.attachmentId } });
  if (!attachment || attachment.taskId !== params.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the uploader or someone with manage rights on the task's project
  // may delete an attachment — otherwise any assignee could wipe files
  // another person uploaded.
  const task = await prisma.task.findUnique({ where: { id: params.id }, select: { projectId: true } });
  const access = await getUserAccess(session);
  const canManage = access.isSuperAdmin || (task?.projectId != null && access.administeredProjectIds.includes(task.projectId));
  if (attachment.uploadedById !== session.user.id && !canManage) {
    return NextResponse.json({ error: "Only the person who uploaded this file, or a project admin, can remove it" }, { status: 403 });
  }

  await deleteFromR2(attachment.fileKey);
  await prisma.attachment.delete({ where: { id: params.attachmentId } });
  await logActivity(params.id, session.user.id, `Removed attachment "${attachment.fileName}"`);

  return NextResponse.json({ ok: true });
}
