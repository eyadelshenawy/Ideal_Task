import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Optional filters: actorId, from / to (YYYY-MM-DD, inclusive), q (text in the message).
export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const actorId = sp.get("actorId");
  const from = sp.get("from");
  const to = sp.get("to");
  const q = sp.get("q")?.trim();

  const where: Prisma.AuditLogWhereInput = {};
  if (actorId) where.actorId = actorId;
  if ((from && DATE_RE.test(from)) || (to && DATE_RE.test(to))) {
    where.createdAt = {
      ...(from && DATE_RE.test(from) ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
      ...(to && DATE_RE.test(to) ? { lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) } : {}),
    };
  }
  if (q) where.message = { contains: q, mode: "insensitive" };

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { actor: { select: { name: true } } },
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      message: e.message,
      actorName: e.actor?.name ?? "Former member",
      createdAt: e.createdAt.toISOString(),
    })),
  );
}
