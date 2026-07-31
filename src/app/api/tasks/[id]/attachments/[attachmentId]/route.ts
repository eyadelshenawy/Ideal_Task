import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";
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

  await deleteFromR2(attachment.fileKey);
  await prisma.attachment.delete({ where: { id: params.attachmentId } });
  await logActivity(params.id, session.user.id, `Removed attachment "${attachment.fileName}"`);

  return NextResponse.json({ ok: true });
}
