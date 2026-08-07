-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "slaTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add projectId nullable first so the existing "default" row
-- doesn't violate NOT NULL, backfill it to the sentinel, then tighten.
ALTER TABLE "SlaConfig" ADD COLUMN     "projectId" TEXT;
ALTER TABLE "SlaConfig" ALTER COLUMN "id" DROP DEFAULT;
UPDATE "SlaConfig" SET "projectId" = '__default__' WHERE "projectId" IS NULL;
ALTER TABLE "SlaConfig" ALTER COLUMN "projectId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SlaConfig_projectId_key" ON "SlaConfig"("projectId");
