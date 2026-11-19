-- CreateEnum
CREATE TYPE "CloseReason" AS ENUM ('RESOLVED', 'NOT_APPLICABLE', 'DUPLICATE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "closeReason" "CloseReason";

-- Data: every task already Done counts as Resolved, except those carrying the
-- old tag convention (Not Applicable / Duplicate / Cancelled), which take that
-- reason instead. Tags are left in place.
UPDATE "Task" SET "closeReason" = 'RESOLVED' WHERE "status" = 'DONE';

UPDATE "Task" t SET "closeReason" = 'NOT_APPLICABLE'
FROM "_TaskTags" tt JOIN "Tag" g ON g."id" = tt."A"
WHERE tt."B" = t."id" AND t."status" = 'DONE' AND lower(g."name") IN ('not applicable', 'not-applicable', 'n/a', 'na');

UPDATE "Task" t SET "closeReason" = 'DUPLICATE'
FROM "_TaskTags" tt JOIN "Tag" g ON g."id" = tt."A"
WHERE tt."B" = t."id" AND t."status" = 'DONE' AND lower(g."name") IN ('duplicate', 'duplicated');

UPDATE "Task" t SET "closeReason" = 'CANCELLED'
FROM "_TaskTags" tt JOIN "Tag" g ON g."id" = tt."A"
WHERE tt."B" = t."id" AND t."status" = 'DONE' AND lower(g."name") IN ('cancelled', 'canceled');
