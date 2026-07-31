import { prisma } from "@/lib/prisma";

/** Finds "@Full Name" mentions of active team members within a comment's text. */
export async function resolveMentions(message: string): Promise<{ id: string; name: string }[]> {
  const members = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const lower = message.toLowerCase();
  return members.filter((m) => lower.includes(`@${m.name.toLowerCase()}`));
}
