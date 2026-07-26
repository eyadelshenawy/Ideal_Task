import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <Dashboard
      userId={session.user.id}
      userName={session.user.name ?? ""}
      isAdmin={session.user.role === "ADMIN"}
    />
  );
}
