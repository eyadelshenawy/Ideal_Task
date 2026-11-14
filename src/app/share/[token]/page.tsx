import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import SharePageContent from "@/components/SharePageContent";

export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const params = await props.params;
  const project = await prisma.project.findUnique({
    where: { shareToken: params.token },
    select: { name: true, deletedAt: true },
  });
  const title = project && !project.deletedAt ? `${project.name} — Project status` : "IDT Desk";
  return {
    title,
    manifest: `/api/public/share/${params.token}/manifest`,
    icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function SharePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return <SharePageContent token={params.token} />;
}
