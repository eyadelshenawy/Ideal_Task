-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "trackingToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_trackingToken_key" ON "Task"("trackingToken");

