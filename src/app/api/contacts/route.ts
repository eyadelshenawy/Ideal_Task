import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { contactCreateSchema } from "@/lib/validation/contact";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const contacts = await prisma.contact.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(contacts);
}

// Super Admin, or anyone holding a project-admin grant on any project — a
// Contact is just a display name, no login/credentials, so this is
// intentionally lighter-weight than team/project management.
export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && access.administeredProjectIds.length === 0) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsed = contactCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid contact" }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: { name: parsed.data.name, projectId: parsed.data.projectId ?? null, email: parsed.data.email || null },
  });
  return NextResponse.json(contact, { status: 201 });
}
