import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTaskAccess } from "@/lib/permissions";
import { uploadToR2, r2Configured } from "@/lib/r2";
import { logActivity } from "@/lib/activity";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB — comfortably under R2's free-tier per-request limits.

function serialize(a: {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
  uploadedBy: { name: string } | null;
}) {
  return {
    id: a.id,
    fileName: a.fileName,
    fileSize: a.fileSize,
    mimeType: a.mimeType,
    createdAt: a.createdAt.toISOString(),
    uploadedByName: a.uploadedBy?.name ?? null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireTaskAccess(params.id);
  if (error) return error;

  const attachments = await prisma.attachment.findMany({
    where: { taskId: params.id },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments.map(serialize));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = await requireTaskAccess(params.id);
  if (error) return error;

  if (!r2Configured()) {
    return NextResponse.json({ error: "File storage isn't configured yet" }, { status: 503 });
  }

  const task = await prisma.task.findUnique({ where: { id: params.id }, select: { id: true, title: true } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File is too large (max 25MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `tasks/${task.id}/${Date.now()}-${file.name}`;

  await uploadToR2(key, buffer, file.type || "application/octet-stream");

  const attachment = await prisma.attachment.create({
    data: {
      taskId: task.id,
      fileName: file.name,
      fileKey: key,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { name: true } } },
  });

  await logActivity(task.id, session.user.id, `Attached "${file.name}"`);

  return NextResponse.json(serialize(attachment), { status: 201 });
}
