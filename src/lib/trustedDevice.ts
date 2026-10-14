import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const TRUSTED_DEVICE_COOKIE = "idl_td";
const TRUSTED_DEVICE_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueTrustedDevice(userId: string, label: string | null): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86400000);
  await prisma.trustedDevice.create({ data: { userId, tokenHash, label, expiresAt } });
  return raw;
}

export async function isDeviceTrusted(userId: string, rawToken: string | undefined): Promise<boolean> {
  if (!rawToken) return false;
  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!device) return false;
  if (device.userId !== userId) return false;
  if (device.expiresAt <= new Date()) return false;
  return true;
}

export async function purgeExpiredTrustedDevices(): Promise<number> {
  const r = await prisma.trustedDevice.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return r.count;
}

export const TRUSTED_DEVICE_MAX_AGE_SECONDS = TRUSTED_DEVICE_DAYS * 86400;
