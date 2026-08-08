import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { nextTaskCode } from "@/lib/taskCode";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/inAppNotify";

// Public, unauthenticated — the token is the only gate. Only ever returns
// the project's name, never anything else about it.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const project = await prisma.project.findUnique({
    where: { intakeToken: params.token },
    select: { name: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }
  return NextResponse.json({ projectName: project.name });
}

// Best-effort in-memory rate limit — resets on every deploy/restart, which
// is an acceptable tradeoff for a small internal tool; not meant to survive
// a determined attacker, just to blunt casual spam.
const submissionsByIp = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (submissionsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  submissionsByIp.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

const submitSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  contactName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email().max(200),
  // Honeypot — a real visitor never sees or fills this field. Deliberately
  // unconstrained (no max(0)) so a bot that fills it still passes schema
  // validation and reaches the check below, which fakes a success response
  // instead of revealing that it was rejected.
  website: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const parsed = submitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in the required fields" }, { status: 400 });
  }
  // Honeypot tripped — pretend success so a bot doesn't learn to adapt.
  if (parsed.data.website) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many submissions — please try again later" }, { status: 429 });
  }

  const project = await prisma.project.findUnique({
    where: { intakeToken: params.token },
    select: { id: true, deletedAt: true },
  });
  if (!project || project.deletedAt) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 });
  }

  const { title, description, contactName, contactEmail } = parsed.data;

  const contact =
    (await prisma.contact.findFirst({ where: { name: contactName } })) ??
    (await prisma.contact.create({ data: { name: contactName } }));

  const code = await nextTaskCode(prisma, project.id);
  const fullDescription = [description, `Submitted by ${contactName} (${contactEmail})`].filter(Boolean).join("\n\n");

  const task = await prisma.task.create({
    data: {
      code,
      title,
      description: fullDescription,
      projectId: project.id,
      status: "TODO",
      priority: "MEDIUM",
      contactAssignees: { connect: [{ id: contact.id }] },
    },
  });

  logActivity(task.id, null, "Submitted via public ticket form").catch((err) => console.error("logActivity failed:", err));

  const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true } });
  notify(admins.map((a) => a.id), `New ticket from ${contactName}: "${title}"`, task.id).catch((err) =>
    console.error("intake notify failed:", err)
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
