import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:admin@ideal-dt.com", PUBLIC_KEY, PRIVATE_KEY);
}

/** Best-effort — never throws into the caller. Drops subscriptions the browser has revoked (410/404). */
export async function sendPushToUsers(userIds: string[], title: string, taskId?: string | null) {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return;
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;

  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: unique } } });
    if (subs.length === 0) return;

    const payload = JSON.stringify({ title: "IDEAL Tasks", body: title, taskId: taskId ?? null });
    const staleIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
          else console.error("web push send failed:", err);
        }
      })
    );

    if (staleIds.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
    }
  } catch (err) {
    console.error("sendPushToUsers failed:", err);
  }
}
