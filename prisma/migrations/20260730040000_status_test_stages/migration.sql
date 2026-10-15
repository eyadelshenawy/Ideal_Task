-- Replace the "Review" status with two separate stages: "Internal Test" and
-- "Customer Test". Existing REVIEW tasks move to INTERNAL_TEST (the earlier
-- of the two) since we can't know which one they actually meant.
--
-- Converted in a single type swap (no ALTER TYPE ... ADD VALUE): Postgres
-- won't let a value added by ADD VALUE be used in the same transaction, which
-- made this migration fail on a fresh database. End state is identical.
ALTER TYPE "Status" RENAME TO "Status_old";
CREATE TYPE "Status" AS ENUM ('TODO', 'INPROGRESS', 'INTERNAL_TEST', 'CUSTOMER_TEST', 'DONE');
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "Status"
  USING (CASE WHEN status::text = 'REVIEW' THEN 'INTERNAL_TEST' ELSE status::text END)::"Status";
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'TODO';
DROP TYPE "Status_old";
