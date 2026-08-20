import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getR2DownloadUrl } from "@/lib/r2";
import { checkRateLimit, ipFromRequest } from "@/lib/rateLimit";

// Public, unauthenticated — the tracking token is the gate. Only ever
// returns a time-limited download URL, and only for an attachment that
// actually belongs to the task this specific token points at.
export async function GET(req: NextRequest, { params }: { params: { token: string; attachmentId: string } }) {
  if (checkRateLimit(`track-dl:${ipFromRequest(req)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please try again later" }, { status: 429 });
  }
  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: { id: true, deletedAt: true },
  });
  if (!task || task.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const attachment = await prisma.attachment.findUnique({ where: { id: params.attachmentId } });
  if (!attachment || attachment.taskId !== task.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await getR2DownloadUrl(attachment.fileKey, attachment.fileName);
  return NextResponse.json({ url });
}
