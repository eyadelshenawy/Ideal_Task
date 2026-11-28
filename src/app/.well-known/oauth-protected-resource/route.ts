import { NextResponse } from "next/server";
import { appOrigin, resourceUrl, OAUTH_SCOPE, CORS_HEADERS, corsPreflight } from "@/lib/mcp/oauth";

// RFC 9728: tells an MCP client which server signs it in for /api/mcp.
export function GET(req: Request) {
  const origin = appOrigin(req);
  return NextResponse.json(
    {
      resource: resourceUrl(origin),
      authorization_servers: [origin],
      scopes_supported: [OAUTH_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "IDT Desk",
    },
    { headers: CORS_HEADERS },
  );
}
export const OPTIONS = corsPreflight;
