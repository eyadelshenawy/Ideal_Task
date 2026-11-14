import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import TrackPageContent from "@/components/TrackPageContent";

export async function generateMetadata(props: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const params = await props.params;
  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: { title: true, deletedAt: true },
  });
  const title = task && !task.deletedAt ? `Ticket status — ${task.title}` : "IDT Desk";
  return {
    title,
    manifest: `/api/public/track/${params.token}/manifest`,
    icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function TrackPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return <TrackPageContent token={params.token} />;
}
