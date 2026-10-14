-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('TASK', 'INCIDENT', 'SERVICE_REQUEST', 'CHANGE_REQUEST', 'PROBLEM');

-- CreateEnum
CREATE TYPE "MatrixLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "WorkWeekConfig" ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
ADD COLUMN     "workEndMinutes" INTEGER NOT NULL DEFAULT 1020,
ADD COLUMN     "workStartMinutes" INTEGER NOT NULL DEFAULT 540;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "slaBusinessHours" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "impact" "MatrixLevel",
ADD COLUMN     "subcategoryId" TEXT,
ADD COLUMN     "type" "TicketType" NOT NULL DEFAULT 'TASK',
ADD COLUMN     "urgency" "MatrixLevel";

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Task_type_idx" ON "Task"("type");

-- CreateIndex
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Starter ticket categories (editable by a Super Admin afterwards).
INSERT INTO "Category" ("id", "name", "sortOrder") VALUES
  ('cat_configuration', 'Configuration', 1),
  ('cat_bug', 'Bug / Error', 2),
  ('cat_authorisation', 'Authorisation & Access', 3),
  ('cat_master_data', 'Master Data', 4),
  ('cat_report', 'Report / Output', 5),
  ('cat_integration', 'Integration / Interface', 6),
  ('cat_enhancement', 'Enhancement', 7),
  ('cat_training', 'Training / How-to', 8)
ON CONFLICT ("id") DO NOTHING;
