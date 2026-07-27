import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserAccess } from "@/lib/permissions";
import Dashboard from "@/components/Dashboard";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const access = await getUserAccess(session);

  return (
    <Dashboard
      userId={session.user.id}
      userName={session.user.name ?? ""}
      isSuperAdmin={access.isSuperAdmin}
      administeredProjectIds={access.administeredProjectIds}
    />
  );
}
