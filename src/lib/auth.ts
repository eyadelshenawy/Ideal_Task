import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { checkRateLimit } from "./rateLimit";
import { verifyTotpCode } from "./totp";
import { isDeviceTrusted, TRUSTED_DEVICE_COOKIE } from "./trustedDevice";
import { loadSecurityConfig, passwordExpired } from "./securityConfig";

// Brute-force lockout: after this many wrong passwords in a row, the account
// is locked for LOCKOUT_MINUTES. Resets to 0 on any successful login.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 2;

// Per-IP throttle: cap login attempts from one source across accounts, so a
// slow-drip attacker sweeping across many usernames still hits a wall even
// though no single account crosses its own MAX_FAILED_ATTEMPTS.
const LOGIN_IP_MAX = 20;
const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Thrown and caught in the authorize flow to tell the login page the password
// was right but we still need a TOTP code before we hand out a session.
export const MFA_REQUIRED_MESSAGE = "MFA_REQUIRED";

function readTrustedDeviceCookie(headers: Record<string, string | undefined>): string | undefined {
  const raw = headers["cookie"];
  if (!raw) return undefined;
  for (const chunk of raw.split(";")) {
    const [k, ...v] = chunk.trim().split("=");
    if (k === TRUSTED_DEVICE_COOKIE) return v.join("=");
  }
  return undefined;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12 hours
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Authenticator code", type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Per-IP throttle across all accounts. Prefer x-real-ip from the
        // trusted proxy; fall back to the last hop of x-forwarded-for.
        const headers = (req?.headers ?? {}) as Record<string, string | undefined>;
        const realIp = typeof headers["x-real-ip"] === "string" ? headers["x-real-ip"].trim() : "";
        const xff = typeof headers["x-forwarded-for"] === "string" ? headers["x-forwarded-for"] : "";
        const xffLast = xff.split(",").map((p) => p.trim()).filter(Boolean).pop() ?? "";
        const ip = realIp || xffLast || "unknown";
        if (checkRateLimit(`login:${ip}`, LOGIN_IP_MAX, LOGIN_IP_WINDOW_MS)) {
          throw new Error("Too many login attempts. Please wait 15 minutes and try again.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user || !user.active) return null;

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
          throw new Error(`Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`);
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
          await prisma.user.update({
            where: { id: user.id },
            data: lockingOut
              ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000) }
              : { failedLoginAttempts: attempts },
          });
          return null;
        }

        // Password is good; now the MFA gate (only if the user has set up TOTP).
        if (user.totpEnabled && user.totpSecret) {
          const trustedCookie = readTrustedDeviceCookie(headers);
          const trusted = await isDeviceTrusted(user.id, trustedCookie);
          if (!trusted) {
            const code = (credentials.totpCode ?? "").trim();
            if (!code) {
              // Signal to the login UI: show the TOTP step, don't lock out.
              throw new Error(MFA_REQUIRED_MESSAGE);
            }
            const codeOk = verifyTotpCode(user.totpSecret, code);
            if (!codeOk) {
              // Wrong codes share the password lockout counter, so a leaked
              // password can't be paired with unlimited code guesses.
              const attempts = user.failedLoginAttempts + 1;
              const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
              await prisma.user.update({
                where: { id: user.id },
                data: lockingOut
                  ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60000) }
                  : { failedLoginAttempts: attempts },
              });
              throw new Error("Invalid Authenticator code. Please try again.");
            }
          }
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          });
        }

        // Password-expiry check — don't block the sign-in itself; set the
        // mustChangePassword flag so the middleware forces /change-password.
        const cfg = await loadSecurityConfig();
        const expired = passwordExpired(user.passwordChangedAt, cfg.passwordExpiryDays);
        const mustChange = user.mustChangePassword || expired;
        if (expired && !user.mustChangePassword) {
          await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: mustChange,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial sign-in: `user` is whatever authorize() returned above.
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.inactive = false;
        return token;
      }

      // Client called useSession().update(...) — e.g. right after a password change.
      if (trigger === "update" && session && typeof session.mustChangePassword === "boolean") {
        token.mustChangePassword = session.mustChangePassword;
        return token;
      }

      // Every other session read: re-check the DB so role/active-status/password
      // changes made by an admin take effect without waiting for re-login.
      if (token.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.id } });
        if (dbUser && dbUser.active) {
          token.role = dbUser.role;
          token.mustChangePassword = dbUser.mustChangePassword;
          token.name = dbUser.name;
          token.inactive = false;
        } else {
          token.inactive = true;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.email = token.email ?? session.user.email;
        session.user.role = token.role;
        session.user.mustChangePassword = token.mustChangePassword;
        session.user.inactive = token.inactive;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      logAudit(user.id, `Logged in`);
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
