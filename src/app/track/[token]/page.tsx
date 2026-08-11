import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import TrackPageContent from "@/components/TrackPageContent";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: { title: true, deletedAt: true },
  });
  const title = task && !task.deletedAt ? `Ticket status — ${task.title}` : "IDEAL Tasks";
  return {
    title,
    manifest: `/api/public/track/${params.token}/manifest`,
    icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  };
}

export default function TrackPage({ params }: { params: { token: string } }) {
  return <TrackPageContent token={params.token} />;
}
