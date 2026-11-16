-- AlterTable
ALTER TABLE "Task" ADD COLUMN "onHoldAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_onHoldAt_idx" ON "Task"("onHoldAt");
