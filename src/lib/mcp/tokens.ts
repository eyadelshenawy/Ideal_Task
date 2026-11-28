import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// MCP access tokens. The token itself is shown once, when it is created;
// only its SHA-256 hash is stored, so a database copy can't be used to read
// data. Never log a token or send it back in a response.

const PREFIX = "idt_";

export function generateMcpToken(): { token: string; hash: string; hint: string } {
  const token = PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashMcpToken(token), hint: token.slice(-4) };
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface McpCaller {
  tokenId: string;
  tokenName: string;
  // Projects this token may read (live, not in Trash, not templates).
  projects: { id: string; code: string; name: string }[];
}

/** Reads "Authorization: Bearer idt_…" and returns the caller, or null. */
export async function authenticateMcp(req: Request): Promise<McpCaller | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match || !match[1].startsWith(PREFIX) || match[1].length > 200) return null;

  const row = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(match[1]) },
    select: {
      id: true,
      name: true,
      revokedAt: true,
      accessExpiresAt: true,
      projects: { where: { deletedAt: null, isTemplate: false }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } },
    },
  });
  if (!row || row.revokedAt) return null;
  // OAuth access tokens last an hour; the app renews them with its refresh token.
  if (row.accessExpiresAt && row.accessExpiresAt.getTime() <= Date.now()) return null;

  prisma.mcpToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { tokenId: row.id, tokenName: row.name, projects: row.projects };
}
