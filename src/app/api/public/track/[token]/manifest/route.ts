import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Per-ticket manifest so the submitter can install their tracking page as an
// icon that opens straight to it — same idea as the intake and share
// manifests.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const task = await prisma.task.findUnique({
    where: { trackingToken: params.token },
    select: { title: true, deletedAt: true },
  });
  if (!task || task.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const manifest = {
    name: `Ticket status — ${task.title}`,
    short_name: "Ticket status",
    start_url: `/track/${params.token}`,
    display: "standalone",
    background_color: "#F5F8F6",
    theme_color: "#0A5A46",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };

  return NextResponse.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
