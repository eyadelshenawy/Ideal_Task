import { NextResponse } from "next/server";
import { appOrigin, OAUTH_SCOPE, CORS_HEADERS, corsPreflight } from "@/lib/mcp/oauth";

// RFC 8414: where to register, sign in and get tokens.
export function GET(req: Request) {
  const origin = appOrigin(req);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [OAUTH_SCOPE],
    },
    { headers: CORS_HEADERS },
  );
}
export const OPTIONS = corsPreflight;
