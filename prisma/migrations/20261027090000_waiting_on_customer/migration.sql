-- "Waiting on Customer" status: the resolution SLA clock stops while a ticket
-- waits on the customer (this status or Customer Test). Additive only.

ALTER TYPE "Status" ADD VALUE 'WAITING_CUSTOMER' AFTER 'INPROGRESS';

ALTER TABLE "Task" ADD COLUMN "pausedAt" TIMESTAMP(3),
ADD COLUMN "pausedMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pausedDays" INTEGER NOT NULL DEFAULT 0;

-- Tickets already in Customer Test start their wait now (not backdated).
UPDATE "Task" SET "pausedAt" = CURRENT_TIMESTAMP WHERE "status" = 'CUSTOMER_TEST';
