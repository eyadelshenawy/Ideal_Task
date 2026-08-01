import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { logAudit } from "./audit";

// Brute-force lockout: after this many wrong passwords in a row, the account
// is locked for LOCKOUT_MINUTES. Resets to 0 on any successful login.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 2;

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
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

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

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
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
