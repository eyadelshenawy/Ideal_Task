import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserAccess } from "@/lib/permissions";
import { loadSecurityConfig } from "@/lib/securityConfig";
import Dashboard from "@/components/Dashboard";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const [access, me, security] = await Promise.all([
    getUserAccess(session),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { totpEnabled: true } }),
    loadSecurityConfig(),
  ]);

  return (
    <Dashboard
      userId={session.user.id}
      userName={session.user.name ?? ""}
      userEmail={session.user.email ?? ""}
      isSuperAdmin={access.isSuperAdmin}
      administeredProjectIds={access.administeredProjectIds}
      mfaInitiallyEnabled={me?.totpEnabled ?? false}
      idleTimeoutMinutes={security.sessionIdleTimeoutMinutes}
    />
  );
}
