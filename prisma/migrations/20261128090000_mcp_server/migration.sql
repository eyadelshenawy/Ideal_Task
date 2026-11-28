-- CreateTable
CREATE TABLE "TaskStatusChange" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" "Status",
    "toStatus" "Status" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpRequestLog" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT,
    "tokenName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "tool" TEXT,
    "projectCode" TEXT,
    "ticketCode" TEXT,
    "outcome" TEXT NOT NULL,
    "resultCount" INTEGER,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_McpTokenProjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "TaskStatusChange_taskId_changedAt_idx" ON "TaskStatusChange"("taskId", "changedAt");

-- CreateIndex
CREATE INDEX "TaskStatusChange_changedAt_idx" ON "TaskStatusChange"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpRequestLog_createdAt_idx" ON "McpRequestLog"("createdAt");

-- CreateIndex
CREATE INDEX "McpRequestLog_tokenId_idx" ON "McpRequestLog"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "_McpTokenProjects_AB_unique" ON "_McpTokenProjects"("A", "B");

-- CreateIndex
CREATE INDEX "_McpTokenProjects_B_index" ON "_McpTokenProjects"("B");

-- AddForeignKey
ALTER TABLE "TaskStatusChange" ADD CONSTRAINT "TaskStatusChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpRequestLog" ADD CONSTRAINT "McpRequestLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_McpTokenProjects" ADD CONSTRAINT "_McpTokenProjects_A_fkey" FOREIGN KEY ("A") REFERENCES "McpToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_McpTokenProjects" ADD CONSTRAINT "_McpTokenProjects_B_fkey" FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Rebuild status history from the activity log ("Status changed from X to Y"
-- lines, one per line of a TaskEvent ACTIVITY message). Labels map back to
-- the Status enum; a line whose labels don't match is skipped.
-- ---------------------------------------------------------------------------
CREATE TABLE "_status_label" (label TEXT PRIMARY KEY, status "Status");
INSERT INTO "_status_label" (label, status) VALUES
  ('new', 'TODO'), ('to do', 'TODO'), ('todo', 'TODO'),
  ('ready', 'READY'),
  ('in progress', 'INPROGRESS'),
  ('waiting', 'WAITING_CUSTOMER'), ('waiting on customer', 'WAITING_CUSTOMER'), ('waiting customer', 'WAITING_CUSTOMER'),
  ('internal test', 'INTERNAL_TEST'),
  ('customer test', 'CUSTOMER_TEST'),
  ('done', 'DONE');

INSERT INTO "TaskStatusChange" ("id", "taskId", "fromStatus", "toStatus", "changedAt")
SELECT 'bf_' || md5(e."id" || '/' || l.n::text), e."taskId", f.status, t.status, e."createdAt"
FROM "TaskEvent" e
CROSS JOIN LATERAL regexp_split_to_table(e."message", E'\n') WITH ORDINALITY AS l(line, n)
CROSS JOIN LATERAL regexp_match(l.line, '^Status changed from (.+) to (.+)$') AS m
JOIN "_status_label" f ON f.label = lower(trim(m[1]))
JOIN "_status_label" t ON t.label = lower(trim(m[2]))
WHERE e."type" = 'ACTIVITY' AND e."message" LIKE '%Status changed from %';

DROP TABLE "_status_label";

-- The first row of every existing task: the status it was created in (the
-- "from" of its earliest recorded change, else its current status).
INSERT INTO "TaskStatusChange" ("id", "taskId", "fromStatus", "toStatus", "changedAt")
SELECT 'bf_' || md5(k."id" || '/created'), k."id", NULL,
  COALESCE(
    (SELECT c."fromStatus" FROM "TaskStatusChange" c WHERE c."taskId" = k."id" ORDER BY c."changedAt" ASC LIMIT 1),
    k."status"
  ),
  k."createdAt"
FROM "Task" k;

-- ---------------------------------------------------------------------------
-- From now on the database records every status change itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "task_status_change_log"() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "TaskStatusChange" ("id", "taskId", "fromStatus", "toStatus", "changedAt")
    VALUES ('sc_' || replace(gen_random_uuid()::text, '-', ''), NEW."id", NULL, NEW."status", (now() AT TIME ZONE 'UTC'));
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    INSERT INTO "TaskStatusChange" ("id", "taskId", "fromStatus", "toStatus", "changedAt")
    VALUES ('sc_' || replace(gen_random_uuid()::text, '-', ''), NEW."id", OLD."status", NEW."status", (now() AT TIME ZONE 'UTC'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "task_status_change_insert" AFTER INSERT ON "Task"
  FOR EACH ROW EXECUTE FUNCTION "task_status_change_log"();
CREATE TRIGGER "task_status_change_update" AFTER UPDATE OF "status" ON "Task"
  FOR EACH ROW EXECUTE FUNCTION "task_status_change_log"();
