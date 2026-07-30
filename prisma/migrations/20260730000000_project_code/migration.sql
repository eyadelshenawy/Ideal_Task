-- Project code prefix + running task-code sequence.
ALTER TABLE "Project" ADD COLUMN "code" TEXT;
ALTER TABLE "Project" ADD COLUMN "taskCodeSeq" INTEGER NOT NULL DEFAULT 0;

UPDATE "Project" SET "code" = 'APEX' WHERE "name" = 'Apex Pharmaceutical';
UPDATE "Project" SET "code" = 'IDEAL' WHERE "name" = 'Ideal - Internal';
UPDATE "Project" SET "code" = 'RCC' WHERE "name" = 'RCC';
-- Fallback for any project this migration doesn't already know by name.
UPDATE "Project" SET "code" = UPPER(LEFT(REGEXP_REPLACE("name", '[^a-zA-Z0-9]', '', 'g'), 6)) WHERE "code" IS NULL;

ALTER TABLE "Project" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");
