import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, getUserAccess } from "@/lib/permissions";
import { contactUpdateSchema } from "@/lib/validation/contact";

async function requireContactManager() {
  const { session, error } = await requireSession();
  if (error) return { error };
  const access = await getUserAccess(session);
  if (!access.isSuperAdmin && access.administeredProjectIds.length === 0) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return { error: null };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireContactManager();
  if (error) return error;

  const parsed = contactUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid contact" }, { status: 400 });
  }

  try {
    const contact = await prisma.contact.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.projectId !== undefined ? { projectId: parsed.data.projectId } : {}),
      },
    });
    return NextResponse.json(contact);
  } catch {
    return NextResponse.json({ error: "Couldn't update contact" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireContactManager();
  if (error) return error;

  await prisma.contact.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
