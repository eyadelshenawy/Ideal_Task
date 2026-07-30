import { prisma } from "@/lib/prisma";

export async function logAudit(actorId: string | null, message: string) {
  try {
    await prisma.auditLog.create({ data: { actorId, message } });
  } catch (err) {
    console.error("logAudit failed:", err);
  }
}
