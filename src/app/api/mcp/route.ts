import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, ipFromRequest } from "@/lib/rateLimit";
import { authenticateMcp, type McpCaller } from "@/lib/mcp/tokens";
import { TOOL_DEFINITIONS, runTool, ToolError } from "@/lib/mcp/tools";

// Read-only MCP server (Streamable HTTP, stateless JSON responses).
// Settings → MCP access creates the tokens and shows the request log.
// See docs/mcp/README.md for setup.

export const dynamic = "force-dynamic";

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY = 64 * 1024;

type JsonRpcId = string | number | null;
interface JsonRpcRequest { jsonrpc?: string; id?: JsonRpcId; method?: unknown; params?: unknown }

function rpcResult(id: JsonRpcId, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: JsonRpcId, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

// Who asked for what, when. Only codes and counts — never the token, the
// arguments as a whole, or any ticket content.
function logRequest(entry: {
  caller: McpCaller | null; method: string; tool?: string; projectCode?: string; ticketCode?: string;
  outcome: string; resultCount?: number; ip: string;
}) {
  const clip = (s?: string) => (s ? s.slice(0, 60) : null);
  prisma.mcpRequestLog
    .create({
      data: {
        tokenId: entry.caller?.tokenId ?? null,
        tokenName: entry.caller?.tokenName ?? "Invalid token",
        method: entry.method.slice(0, 60),
        tool: clip(entry.tool),
        projectCode: clip(entry.projectCode),
        ticketCode: clip(entry.ticketCode),
        outcome: entry.outcome,
        resultCount: entry.resultCount ?? null,
        ip: entry.ip.slice(0, 64),
      },
    })
    .catch(() => console.error("mcp: request log write failed"));
}

export async function POST(req: Request) {
  const ip = ipFromRequest(req);
  if (checkRateLimit(`mcp-ip:${ip}`, 300, 60_000)) {
    return rpcError(null, -32000, "Too many requests — try again in a minute", 429);
  }

  const caller = await authenticateMcp(req);
  if (!caller) {
    logRequest({ caller: null, method: "auth", outcome: "unauthorised", ip });
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or invalid token" } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="IDT Desk MCP"' } },
    );
  }
  if (checkRateLimit(`mcp-token:${caller.tokenId}`, 120, 60_000)) {
    logRequest({ caller, method: "rate_limit", outcome: "denied", ip });
    return rpcError(null, -32000, "Too many requests — try again in a minute", 429);
  }

  const text = await req.text();
  if (text.length > MAX_BODY) return rpcError(null, -32600, "Request too large", 413);
  let msg: JsonRpcRequest;
  try {
    msg = JSON.parse(text);
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.method !== "string") {
    return rpcError(null, -32600, "Invalid request", 400);
  }

  const method = msg.method;
  const id: JsonRpcId = msg.id ?? null;
  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;

  // Notifications (no id) need no answer.
  if (msg.id === undefined) return new NextResponse(null, { status: 202 });

  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      logRequest({ caller, method, outcome: "ok", ip });
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "idt-desk", title: "IDT Desk (read-only)", version: "1.0.0" },
        instructions:
          "Read-only access to IDT Desk tickets. Start with list_projects. Every ticket tool works on one project at a time; " +
          "use the project code (e.g. ABM). Dates are UTC.",
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      logRequest({ caller, method, outcome: "ok", resultCount: TOOL_DEFINITIONS.length, ip });
      return rpcResult(id, { tools: TOOL_DEFINITIONS });

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? params.arguments
        : {}) as Record<string, unknown>;
      const askedProject = typeof args.project === "string" ? args.project : undefined;
      const askedCode = typeof args.code === "string" ? args.code : undefined;
      try {
        const r = await runTool(name, args, caller);
        logRequest({ caller, method, tool: name, projectCode: r.projectCode, ticketCode: r.ticketCode, outcome: "ok", resultCount: r.resultCount, ip });
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }],
          structuredContent: r.data,
          isError: false,
        });
      } catch (err) {
        const known = err instanceof ToolError;
        if (!known) console.error("mcp: tool failed:", name, err instanceof Error ? err.name : "error");
        logRequest({ caller, method, tool: name, projectCode: askedProject, ticketCode: askedCode, outcome: known ? err.outcome : "error", ip });
        return rpcResult(id, {
          content: [{ type: "text", text: known ? err.message : "Something went wrong — please try again" }],
          isError: true,
        });
      }
    }

    default:
      logRequest({ caller, method, outcome: "invalid", ip });
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// Stateless server: no server-to-client stream and no sessions to end.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
