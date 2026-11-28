import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, ipFromRequest } from "@/lib/rateLimit";
import { isAllowedRedirect, randomSecret, oauthError, CORS_HEADERS, corsPreflight } from "@/lib/mcp/oauth";

// RFC 7591 dynamic client registration. Anyone may register, but only
// claude.ai / claude.com callbacks and loopback addresses are accepted, and
// registering grants nothing: a Super Admin still has to press Allow.
export async function POST(req: Request) {
  if (checkRateLimit(`oauth-register:${ipFromRequest(req)}`, 20, 60 * 60 * 1000)) {
    return oauthError("too_many_requests", "Too many registrations — try again later", 429);
  }
  const body = (await req.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown; token_endpoint_auth_method?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body!.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 5 || uris.some((u) => u.length > 300)) {
    return oauthError("invalid_redirect_uri", "Give one to five redirect_uris");
  }
  if (!uris.every(isAllowedRedirect)) {
    return oauthError("invalid_redirect_uri", "Only claude.ai, claude.com or loopback redirect addresses are allowed");
  }
  if (body?.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    return oauthError("invalid_client_metadata", "Only public clients (token_endpoint_auth_method: none) are supported");
  }
  const name = typeof body?.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 80) : "Unnamed app";

  const client = await prisma.oAuthClient.create({
    data: { id: randomSecret("idc_").slice(0, 36), name, redirectUris: uris },
    select: { id: true, name: true, redirectUris: true, createdAt: true },
  });
  return NextResponse.json(
    {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: CORS_HEADERS },
  );
}
export const OPTIONS = corsPreflight;
