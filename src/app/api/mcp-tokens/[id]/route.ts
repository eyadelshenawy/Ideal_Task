import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Revoke: the token stops working at once. The row stays so the request
// log keeps its name.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const { id } = await params;
  const row = await prisma.mcpToken.findUnique({ where: { id }, select: { name: true, revokedAt: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!row.revokedAt) {
    await prisma.mcpToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAudit(session.user.id, `Revoked MCP token "${row.name}"`);
  }
  return NextResponse.json({ ok: true });
}
