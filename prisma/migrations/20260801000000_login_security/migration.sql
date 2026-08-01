-- Brute-force lockout + self-service password reset support
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenExpires" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");
