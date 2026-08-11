import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Per-project manifest so the person a status link is shared with can
// install it as an icon that opens straight to their project's status page
// — same idea as the intake and tracking link manifests.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const project = await prisma.project.findUnique({
    where: { shareToken: params.token },
    select: { name: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const manifest = {
    name: `${project.name} — Project status`,
    short_name: project.name.slice(0, 20),
    start_url: `/share/${params.token}`,
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
