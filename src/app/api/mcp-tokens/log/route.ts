import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";

// The latest MCP requests: who (token name), what (tool, project, ticket),
// when, and how it went.
export async function GET(req: Request) {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  const tokenId = new URL(req.url).searchParams.get("tokenId");
  const rows = await prisma.mcpRequestLog.findMany({
    where: tokenId ? { tokenId } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, tokenName: true, method: true, tool: true, projectCode: true, ticketCode: true, outcome: true, resultCount: true, ip: true, createdAt: true },
  });
  return NextResponse.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
}
