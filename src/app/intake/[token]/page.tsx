import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import IntakePageContent from "@/components/IntakePageContent";

// Overrides the root layout's app-wide manifest (which points start_url at
// "/", the login page) with one scoped to this specific project's form, so
// "Add to Home Screen" / desktop "Install" gives the customer an icon that
// opens straight to their ticket form.
export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const params = await props.params;
  const project = await prisma.project.findUnique({
    where: { intakeToken: params.token },
    select: { name: true, deletedAt: true },
  });
  const title = project && !project.deletedAt ? `${project.name} — Submit a request` : "IDT Desk";
  return {
    title,
    manifest: `/api/public/intake/${params.token}/manifest`,
    icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function IntakePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return <IntakePageContent token={params.token} />;
}
