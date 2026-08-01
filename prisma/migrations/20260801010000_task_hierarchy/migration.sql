-- Parent/child task hierarchy (e.g. ABC-0001 -> ABC-0001-01)
ALTER TABLE "Task" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Task" ADD COLUMN "childCodeSeq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
