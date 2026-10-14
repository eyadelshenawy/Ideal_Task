-- Phase 1 security: TOTP, trusted devices, password expiry, security policy singleton.

-- User additions
ALTER TABLE "User"
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "totpSecret" TEXT,
  ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill passwordChangedAt for existing users so they're not immediately expired.
UPDATE "User" SET "passwordChangedAt" = COALESCE("updatedAt", "createdAt", NOW())
  WHERE "passwordChangedAt" IS NULL;

-- TrustedDevice: a browser the user asked us to remember after an MFA pass.
CREATE TABLE "TrustedDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");

ALTER TABLE "TrustedDevice"
  ADD CONSTRAINT "TrustedDevice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SecurityConfig: org-wide policy singleton (id = 'singleton').
CREATE TABLE "SecurityConfig" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 15,
  "passwordExpiryDays" INTEGER NOT NULL DEFAULT 90,
  "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
  "passwordRequireUppercase" BOOLEAN NOT NULL DEFAULT true,
  "passwordRequireNumber" BOOLEAN NOT NULL DEFAULT true,
  "passwordRequireSymbol" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SecurityConfig" ("id", "updatedAt") VALUES ('singleton', NOW())
  ON CONFLICT ("id") DO NOTHING;
