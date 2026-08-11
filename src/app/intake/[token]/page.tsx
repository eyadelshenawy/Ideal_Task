import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import IntakePageContent from "@/components/IntakePageContent";

// Overrides the root layout's app-wide manifest (which points start_url at
// "/", the login page) with one scoped to this specific project's form, so
// "Add to Home Screen" / desktop "Install" gives the customer an icon that
// opens straight to their ticket form.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const project = await prisma.project.findUnique({
    where: { intakeToken: params.token },
    select: { name: true, deletedAt: true },
  });
  const title = project && !project.deletedAt ? `${project.name} — Submit a request` : "IDEAL Tasks";
  return {
    title,
    manifest: `/api/public/intake/${params.token}/manifest`,
    icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  };
}

export default function IntakePage({ params }: { params: { token: string } }) {
  return <IntakePageContent token={params.token} />;
}
