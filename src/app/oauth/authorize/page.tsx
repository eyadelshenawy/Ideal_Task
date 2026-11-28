import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAuthorizeRequest } from "@/lib/mcp/oauth";
import AuthorizeForm from "./AuthorizeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect to IDT Desk" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-brand-border p-6">{children}</div>
    </div>
  );
}

// Where claude.ai (or another MCP app) sends a Super Admin to allow read
// access to chosen projects. Signed-out visitors are sent to /login first
// by the middleware, then brought back here.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const checked = await checkAuthorizeRequest(q);
  if ("error" in checked) {
    return <Shell><h1 className="font-bold text-[17px] text-brand-text mb-2">Can&apos;t connect</h1><p className="text-[13px] text-brand-sub">{checked.error}</p></Shell>;
  }

  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return <Shell><h1 className="font-bold text-[17px] text-brand-text mb-2">Super Admin only</h1><p className="text-[13px] text-brand-sub">Only a Super Admin can connect an app to IDT Desk. Ask a Super Admin to do it.</p></Shell>;
  }

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, isTemplate: false },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });

  return (
    <Shell>
      <AuthorizeForm
        clientName={checked.client.name}
        redirectHost={new URL(checked.redirectUri).host}
        projects={projects}
        request={{
          client_id: checked.client.id,
          redirect_uri: checked.redirectUri,
          code_challenge: checked.codeChallenge,
          code_challenge_method: "S256",
          response_type: "code",
          state: checked.state ?? "",
        }}
      />
    </Shell>
  );
}
