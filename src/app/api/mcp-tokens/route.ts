import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { generateMcpToken } from "@/lib/mcp/tokens";
import { logAudit } from "@/lib/audit";

// Settings → MCP access (Super Admin only). The token hash never leaves the
// server; the token itself is returned once, by POST, and never again.

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  const rows = await prisma.mcpToken.findMany({
    orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    select: {
      id: true, name: true, hint: true, createdAt: true, lastUsedAt: true, revokedAt: true,
      createdBy: { select: { name: true } },
      projects: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" } },
    },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      hint: r.hint,
      createdBy: r.createdBy?.name ?? "Former member",
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      projects: r.projects,
    })),
  );
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name").max(80, "Name is too long"),
  projectIds: z.array(z.string().min(1)).min(1, "Pick at least one project").max(100),
});

export async function POST(req: Request) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const projects = await prisma.project.findMany({
    where: { id: { in: parsed.data.projectIds }, deletedAt: null, isTemplate: false },
    select: { id: true, code: true },
  });
  if (projects.length !== new Set(parsed.data.projectIds).size) {
    return NextResponse.json({ error: "One of the projects no longer exists" }, { status: 400 });
  }

  const { token, hash, hint } = generateMcpToken();
  const row = await prisma.mcpToken.create({
    data: {
      name: parsed.data.name,
      tokenHash: hash,
      hint,
      createdById: session.user.id,
      projects: { connect: projects.map((p) => ({ id: p.id })) },
    },
    select: { id: true },
  });
  await logAudit(session.user.id, `Created MCP token "${parsed.data.name}" for ${projects.map((p) => p.code).join(", ")}`);
  return NextResponse.json({ id: row.id, token }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
