-- These schema changes reached production without a migration file, so a
-- fresh database built from migrations alone was missing them. Every
-- statement is idempotent: on a database that already has them (production)
-- this migration changes nothing.

ALTER TYPE "Priority" ADD VALUE IF NOT EXISTS 'CRITICAL';

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isTemplate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SlaConfig"
  ADD COLUMN IF NOT EXISTS "criticalResponseHours" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "criticalResolutionDays" INTEGER NOT NULL DEFAULT 2,
  ALTER COLUMN "highResponseHours" SET DEFAULT 24,
  ALTER COLUMN "highResolutionDays" SET DEFAULT 4,
  ALTER COLUMN "mediumResponseHours" SET DEFAULT 48,
  ALTER COLUMN "mediumResolutionDays" SET DEFAULT 7,
  ALTER COLUMN "lowResponseHours" SET DEFAULT 72;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "durationDays" INTEGER;

CREATE TABLE IF NOT EXISTS "WorkWeekConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "sun" BOOLEAN NOT NULL DEFAULT true,
    "mon" BOOLEAN NOT NULL DEFAULT true,
    "tue" BOOLEAN NOT NULL DEFAULT true,
    "wed" BOOLEAN NOT NULL DEFAULT true,
    "thu" BOOLEAN NOT NULL DEFAULT true,
    "fri" BOOLEAN NOT NULL DEFAULT false,
    "sat" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkWeekConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Holiday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_date_key" ON "Holiday"("date");
CREATE INDEX IF NOT EXISTS "Holiday_date_idx" ON "Holiday"("date");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Holiday_createdById_fkey') THEN
    ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
