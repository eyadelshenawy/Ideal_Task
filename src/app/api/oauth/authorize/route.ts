import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { checkAuthorizeRequest, redirectWith, randomSecret, sha256, CODE_TTL_MS } from "@/lib/mcp/oauth";

// The Allow / Deny buttons on /oauth/authorize. Super Admin only. Returns
// the address to send the browser back to, with a one-time code or an error.
export async function POST(req: Request) {
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const q: Record<string, string | undefined> = {};
  for (const k of ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "response_type"]) {
    if (typeof body?.[k] === "string") q[k] = body[k] as string;
  }
  const checked = await checkAuthorizeRequest(q);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (body?.decision !== "allow") {
    return NextResponse.json({ redirect: redirectWith(checked.redirectUri, { error: "access_denied", state: checked.state }) });
  }

  const ids = Array.isArray(body.projectIds) ? body.projectIds.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  const projects = await prisma.project.findMany({ where: { id: { in: ids }, deletedAt: null, isTemplate: false }, select: { id: true } });
  if (projects.length === 0) return NextResponse.json({ error: "Pick at least one project" }, { status: 400 });

  const code = randomSecret("idtc_");
  await prisma.oAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: checked.client.id,
      userId: session.user.id,
      redirectUri: checked.redirectUri,
      codeChallenge: checked.codeChallenge,
      projectIds: projects.map((x) => x.id),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return NextResponse.json({ redirect: redirectWith(checked.redirectUri, { code, state: checked.state }) });
}
