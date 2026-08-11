import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// A per-project Web App Manifest so a customer can "Add to Home Screen" (or
// desktop "Install") the intake form directly — a real icon that opens
// straight to their project's form, not the internal app's login page (which
// is what they'd get "installing" without this, since the root layout's
// manifest points start_url at "/"). Public, unauthenticated, same gate as
// the intake endpoints themselves.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const project = await prisma.project.findUnique({
    where: { intakeToken: params.token },
    select: { name: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const manifest = {
    name: `${project.name} — Submit a request`,
    short_name: project.name.slice(0, 20),
    start_url: `/intake/${params.token}`,
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
