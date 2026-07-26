import { NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "./auth";

type SessionResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

/** Any signed-in, active user. Every API route should start with this (or requireAdmin). */
export async function requireSession(): Promise<SessionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.inactive) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

/** Admin-only routes: task/project/team-member creation, deletion, and full edits. */
export async function requireAdmin(): Promise<SessionResult> {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session.user.role !== "ADMIN") {
    return { session: null, error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return result;
}
