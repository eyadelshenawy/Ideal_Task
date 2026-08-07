import { prisma } from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

/** Creates one in-app notification per user, plus a Web Push to any device they've opted into. Best-effort — never throws into the caller's request. */
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
  sendPushToUsers(unique, message, taskId).catch((err) => console.error("push notify failed:", err));
}
