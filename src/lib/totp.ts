import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { randomBytes } from "crypto";

const ISSUER = "IDEAL Tasks";

export function generateTotpSecret(): string {
  // 20 bytes = 32 base32 chars, the RFC 6238 recommended size.
  return new OTPAuth.Secret({ buffer: new Uint8Array(randomBytes(20)).buffer }).base32;
}

function buildTotp(secret: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function totpAuthUri(secret: string, email: string): string {
  return buildTotp(secret, email).toString();
}

export async function totpQrDataUrl(secret: string, email: string): Promise<string> {
  return QRCode.toDataURL(totpAuthUri(secret, email), { margin: 1, width: 240 });
}

// Accept the current period and one on each side (±30s) so a slightly off
// clock doesn't lock the user out — the standard tolerance recommendation.
export function verifyTotpCode(secret: string, token: string): boolean {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const totp = buildTotp(secret, "");
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}
