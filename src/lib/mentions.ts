import { prisma } from "@/lib/prisma";
import { canViewTask } from "@/lib/taskVisibility";

/** Finds "@Full Name" mentions of active team members within a comment's text. */
export async function resolveMentions(message: string): Promise<{ id: string; name: string }[]> {
  const members = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const lower = message.toLowerCase();
  return members.filter((m) => lower.includes(`@${m.name.toLowerCase()}`));
}

/**
 * Same as resolveMentions but drops anyone who wouldn't be allowed to open
 * the task the mention points at — otherwise they'd get a notification
 * linking to a task that 404s on click (private task, task in a project
 * they don't administer and aren't assigned to, etc.).
 */
export async function resolveVisibleMentions(
  message: string,
  taskId: string
): Promise<{ id: string; name: string }[]> {
  const candidates = await resolveMentions(message);
  if (candidates.length === 0) return [];
  const checks = await Promise.all(
    candidates.map(async (m) => {
      const grants = await prisma.projectAdmin.findMany({ where: { userId: m.id }, select: { projectId: true } });
      const user = await prisma.user.findUnique({ where: { id: m.id }, select: { role: true } });
      const isSuperAdmin = user?.role === "SUPER_ADMIN";
      const visible = await canViewTask(taskId, m.id, isSuperAdmin, grants.map((g) => g.projectId));
      return visible ? m : null;
    })
  );
  return checks.filter((m): m is { id: string; name: string } => m !== null);
}
