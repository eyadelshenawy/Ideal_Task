import { prisma } from "@/lib/prisma";

/** Creates one in-app notification per user. Best-effort — never throws into the caller's request. */
export async function notify(userIds: string[], message: string, taskId?: string) {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, message, taskId: taskId ?? null })),
    });
  } catch (err) {
    console.error("in-app notify failed:", err);
  }
}
