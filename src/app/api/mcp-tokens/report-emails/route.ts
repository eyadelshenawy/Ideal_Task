import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// Settings → MCP access → Report emails: who receives the report the MCP
// send_report tool emails for each project.

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  const rows = await prisma.project.findMany({
    where: { deletedAt: null, isTemplate: false },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, reportEmails: true },
  });
  return NextResponse.json(rows);
}

const schema = z.object({
  projectId: z.string().min(1),
  emails: z.array(z.string().trim().toLowerCase().email("One of the addresses isn't a valid email")).max(20, "At most 20 addresses"),
});

export async function PUT(req: Request) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const project = await prisma.project.findFirst({ where: { id: parsed.data.projectId, deletedAt: null }, select: { id: true, code: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const emails = [...new Set(parsed.data.emails)];
  await prisma.project.update({ where: { id: project.id }, data: { reportEmails: emails } });
  await logAudit(session.user.id, `Set MCP report emails for ${project.code} (${emails.length} address${emails.length === 1 ? "" : "es"})`);
  return NextResponse.json({ ok: true, emails });
}
