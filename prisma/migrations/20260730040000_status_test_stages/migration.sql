-- Replace the "Review" status with two separate stages: "Internal Test" and
-- "Customer Test". Existing REVIEW tasks move to INTERNAL_TEST (the earlier
-- of the two) since we can't know which one they actually meant.
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'INTERNAL_TEST';
ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'CUSTOMER_TEST';

UPDATE "Task" SET status = 'INTERNAL_TEST' WHERE status = 'REVIEW';

ALTER TYPE "Status" RENAME TO "Status_old";
CREATE TYPE "Status" AS ENUM ('TODO', 'INPROGRESS', 'INTERNAL_TEST', 'CUSTOMER_TEST', 'DONE');
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "Status" USING (status::text::"Status");
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'TODO';
DROP TYPE "Status_old";
