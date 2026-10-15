-- Ticket types, modules and priority names/colours become editable lists.
-- Task.type keeps every existing value: the column is converted in place from
-- the old enum to text (never dropped).

ALTER TABLE "Task" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "Task" ALTER COLUMN "type" SET DEFAULT 'TASK';
DROP TYPE "TicketType";

CREATE TABLE "TicketTypeOption" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "bg" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TicketTypeOption_pkey" PRIMARY KEY ("code")
);

INSERT INTO "TicketTypeOption" ("code", "label", "short", "color", "bg", "sortOrder", "system") VALUES
  ('TASK', 'Task', 'Task', '#5B6B66', '#EEF1F0', 1, true),
  ('INCIDENT', 'Incident', 'INC', '#9A3530', '#FBE7E5', 2, true),
  ('SERVICE_REQUEST', 'Service Request', 'SR', '#0A5A46', '#E4F0EA', 3, true),
  ('CHANGE_REQUEST', 'Change Request', 'CHG', '#8A5A00', '#FFF3D6', 4, false),
  ('PROBLEM', 'Problem', 'PRB', '#5A3E8A', '#EEE7F8', 5, false)
ON CONFLICT ("code") DO NOTHING;

CREATE TABLE "ModuleOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModuleOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModuleOption_name_key" ON "ModuleOption"("name");

-- Start the module list from every module already typed on a task.
INSERT INTO "ModuleOption" ("id", "name", "sortOrder")
SELECT gen_random_uuid()::text, m.name, ROW_NUMBER() OVER (ORDER BY m.name)
FROM (
  SELECT DISTINCT trim(part) AS name
  FROM "Task", regexp_split_to_table(COALESCE("module", ''), ',') AS part
  WHERE trim(part) <> ''
) m
ON CONFLICT ("name") DO NOTHING;

CREATE TABLE "PriorityOption" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    CONSTRAINT "PriorityOption_pkey" PRIMARY KEY ("code")
);

INSERT INTO "PriorityOption" ("code", "label", "color") VALUES
  ('CRITICAL', 'Critical', '#8B1A16'),
  ('HIGH', 'High', '#C4443D'),
  ('MEDIUM', 'Medium', '#D98B3A'),
  ('LOW', 'Low', '#6B8F80')
ON CONFLICT ("code") DO NOTHING;
