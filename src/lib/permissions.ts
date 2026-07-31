import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { canViewTask } from "./taskVisibility";

type SessionResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

/** Any signed-in, active user. Every API route should start with this (or requireSuperAdmin). */
export async function requireSession(): Promise<SessionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.inactive) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

/**
 * Super-Admin-only routes: project/team-member creation & deletion, Excel
 * import, and granting per-project admin rights. Task create/edit/delete use
 * the finer-grained project-scoped checks below instead.
 */
export async function requireSuperAdmin(): Promise<SessionResult> {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session.user.role !== "SUPER_ADMIN") {
    return { session: null, error: NextResponse.json({ error: "Super Admin access required" }, { status: 403 }) };
  }
  return result;
}

export interface UserAccess {
  isSuperAdmin: boolean;
  /** Project ids this user holds a per-project admin grant on. Empty for Super Admins (they don't need grants). */
  administeredProjectIds: string[];
}

/** A user's global role plus their per-project admin grants (see ProjectAdmin model). */
export async function getUserAccess(session: Session): Promise<UserAccess> {
  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  if (isSuperAdmin) return { isSuperAdmin, administeredProjectIds: [] };

  const grants = await prisma.projectAdmin.findMany({
    where: { userId: session.user.id },
    select: { projectId: true },
  });
  return { isSuperAdmin, administeredProjectIds: grants.map((g) => g.projectId) };
}

type ProjectAccessResult = SessionResult & { access?: UserAccess };

/**
 * Hard gate for task create/delete: passes for Super Admins, or for a
 * Project-Admin grant holder on the given project. `projectId` must be
 * non-null for a non-Super-Admin to ever pass (a project-admin grant is
 * inherently tied to a project).
 */
export async function requireProjectAccess(projectId: string | null): Promise<ProjectAccessResult> {
  const result = await requireSession();
  if (result.error) return result;

  const access = await getUserAccess(result.session);
  if (access.isSuperAdmin || (projectId && access.administeredProjectIds.includes(projectId))) {
    return { ...result, access };
  }
  return { session: null, error: NextResponse.json({ error: "You don't have admin rights on this project" }, { status: 403 }) };
}

/**
 * Gate for the per-task detail endpoints (comments, checklist, attachments):
 * signed in AND the task is actually visible to them under the same rule as
 * the main task list — otherwise knowing a task's id would be enough to read
 * or write to it even when the UI would never have shown it to them. Returns
 * 404 rather than 403 so a hidden task's existence isn't confirmed either way.
 */
export async function requireTaskAccess(taskId: string): Promise<SessionResult> {
  const result = await requireSession();
  if (result.error) return result;

  const access = await getUserAccess(result.session);
  const visible = await canViewTask(taskId, result.session.user.id, access.isSuperAdmin, access.administeredProjectIds);
  if (!visible) {
    return { session: null, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return result;
}
