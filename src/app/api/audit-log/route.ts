import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
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
