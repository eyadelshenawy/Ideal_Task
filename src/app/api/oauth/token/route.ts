import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { checkRateLimit, ipFromRequest } from "@/lib/rateLimit";
import { generateMcpToken } from "@/lib/mcp/tokens";
import { logAudit } from "@/lib/audit";
import { sha256, pkceMatches, issueTokens, oauthError, CORS_HEADERS, corsPreflight } from "@/lib/mcp/oauth";

// Swaps a one-time sign-in code (with its PKCE verifier) or a refresh token
// for a new access token. Every refresh rotates the refresh token too.

async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const text = (await req.text()).slice(0, 8192);
  if (type.includes("application/json")) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

async function stillSuperAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  return !!u && u.active && u.role === "SUPER_ADMIN";
}

export async function POST(req: Request) {
  if (checkRateLimit(`oauth-token:${ipFromRequest(req)}`, 60, 60_000)) {
    return oauthError("too_many_requests", "Too many requests — try again in a minute", 429);
  }
  const p = await readParams(req);

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.client_id || !p.redirect_uri || !p.code_verifier) {
      return oauthError("invalid_request", "code, client_id, redirect_uri and code_verifier are required");
    }
    const code = await prisma.oAuthCode.findUnique({
      where: { codeHash: sha256(p.code) },
      include: { client: { select: { name: true } } },
    });
    if (!code || code.clientId !== p.client_id || code.redirectUri !== p.redirect_uri || code.expiresAt.getTime() < Date.now()) {
      return oauthError("invalid_grant", "The sign-in code is invalid or has expired");
    }
    if (!pkceMatches(p.code_verifier, code.codeChallenge)) return oauthError("invalid_grant", "PKCE check failed");
    // One use only, even if two requests race.
    const claimed = await prisma.oAuthCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return oauthError("invalid_grant", "The sign-in code was already used");
    if (!(await stillSuperAdmin(code.userId))) return oauthError("invalid_grant", "The person who allowed this is no longer a Super Admin");

    const projects = await prisma.project.findMany({
      where: { id: { in: code.projectIds }, deletedAt: null, isTemplate: false },
      select: { id: true, code: true },
    });
    if (projects.length === 0) return oauthError("invalid_grant", "None of the chosen projects exist any more");
    const user = await prisma.user.findUnique({ where: { id: code.userId }, select: { name: true } });

    // Placeholder hash until issueTokens sets the real one.
    const placeholder = generateMcpToken();
    const row = await prisma.mcpToken.create({
      data: {
        name: `${code.client.name} — ${user?.name ?? "Super Admin"}`.slice(0, 120),
        tokenHash: placeholder.hash,
        hint: "····",
        createdById: code.userId,
        clientId: code.clientId,
        projects: { connect: projects.map((x) => ({ id: x.id })) },
      },
      select: { id: true },
    });
    await logAudit(code.userId, `Connected "${code.client.name}" to MCP for ${projects.map((x) => x.code).join(", ")}`);
    return NextResponse.json(await issueTokens(row.id), { headers: CORS_HEADERS });
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return oauthError("invalid_request", "refresh_token is required");
    const row = await prisma.mcpToken.findUnique({
      where: { refreshHash: sha256(p.refresh_token) },
      select: { id: true, clientId: true, revokedAt: true, refreshExpiresAt: true, createdById: true },
    });
    if (
      !row || row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt.getTime() < Date.now() ||
      (p.client_id && row.clientId !== p.client_id)
    ) {
      return oauthError("invalid_grant", "The refresh token is invalid, expired or revoked");
    }
    if (!(await stillSuperAdmin(row.createdById))) return oauthError("invalid_grant", "The person who allowed this is no longer a Super Admin");
    return NextResponse.json(await issueTokens(row.id), { headers: CORS_HEADERS });
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}
export const OPTIONS = corsPreflight;
