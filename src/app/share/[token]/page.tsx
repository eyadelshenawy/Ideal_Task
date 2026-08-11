import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import SharePageContent from "@/components/SharePageContent";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const project = await prisma.project.findUnique({
    where: { shareToken: params.token },
    select: { name: true, deletedAt: true },
  });
  const title = project && !project.deletedAt ? `${project.name} — Project status` : "IDEAL Tasks";
  return {
    title,
    manifest: `/api/public/share/${params.token}/manifest`,
    icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  };
}

export default function SharePage({ params }: { params: { token: string } }) {
  return <SharePageContent token={params.token} />;
}
