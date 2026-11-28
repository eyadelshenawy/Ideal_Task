import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashMcpToken } from "./tokens";

// OAuth 2.1 sign-in for the MCP server, so claude.ai can add IDT Desk as a
// connector. Flow: the app registers itself (/api/oauth/register), sends a
// Super Admin to /oauth/authorize to pick projects and press Allow, then
// swaps the one-time code for an access token (/api/oauth/token). Tokens
// land in McpToken like the ones made by hand, so Settings → MCP access
// lists and revokes them and every request is logged the same way.

export const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TTL_DAYS = 30; // renewed every time it is used
export const CODE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_SCOPE = "tickets:read";

/** The public address of this app, e.g. https://ideal-tasks-app.onrender.com */
export function appOrigin(req: Request): string {
  const env = process.env.NEXTAUTH_URL;
  if (env) {
    try {
      return new URL(env).origin;
    } catch {}
  }
  return new URL(req.url).origin;
}

export const resourceUrl = (origin: string) => `${origin}/api/mcp`;
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource`;

// Only these apps may receive a sign-in code: claude.ai / claude.com
// connectors, and tools running on the user's own computer (loopback).
export function isAllowedRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:" && (u.hostname === "claude.ai" || u.hostname === "claude.com") && u.pathname === "/api/mcp/auth_callback") {
    return true;
  }
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

export function randomSecret(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return createHash("sha256").update(verifier, "ascii").digest("base64url") === challenge;
}

/** Validates the query an app sends to /oauth/authorize. Returns an error to show, or the checked values. */
export async function checkAuthorizeRequest(q: Record<string, string | undefined>) {
  const clientId = q.client_id ?? "";
  const redirectUri = q.redirect_uri ?? "";
  if (!clientId || !redirectUri) return { error: "This sign-in link is incomplete." } as const;
  const client = await prisma.oAuthClient.findUnique({ where: { id: clientId }, select: { id: true, name: true, redirectUris: true } });
  // Never redirect to an address the app didn't register, or one we don't allow.
  if (!client || !client.redirectUris.includes(redirectUri) || !isAllowedRedirect(redirectUri)) {
    return { error: "This app isn't allowed to connect to IDT Desk." } as const;
  }
  if (q.response_type !== "code") return { error: "Unsupported sign-in type.", redirectError: "unsupported_response_type", client, redirectUri } as const;
  if (!q.code_challenge || q.code_challenge_method !== "S256" || !/^[A-Za-z0-9\-_]{43}$/.test(q.code_challenge)) {
    return { error: "This sign-in link is missing its security check (PKCE).", redirectError: "invalid_request", client, redirectUri } as const;
  }
  return { client, redirectUri, codeChallenge: q.code_challenge, state: q.state ?? null } as const;
}

export function redirectWith(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}

/** Issues a fresh access + refresh token pair on an McpToken row (new or existing). */
export async function issueTokens(tokenRowId: string) {
  const access = randomSecret("idt_");
  const refresh = randomSecret("idtr_");
  const now = Date.now();
  await prisma.mcpToken.update({
    where: { id: tokenRowId },
    data: {
      tokenHash: hashMcpToken(access),
      hint: access.slice(-4),
      accessExpiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
      refreshHash: sha256(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TTL_DAYS * 86400000),
    },
  });
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refresh,
    scope: OAUTH_SCOPE,
  };
}

// The discovery and token endpoints are called by other apps, sometimes from
// a browser; they use no cookies, so any origin may read them.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Cache-Control": "no-store",
};

export function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: CORS_HEADERS });
}

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
