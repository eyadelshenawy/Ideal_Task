-- Soft-delete support for Task and Project (Trash feature)
ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");
