-- Recurring tasks: completing a task with a recurrenceFreq set auto-creates
-- the next occurrence.
CREATE TYPE "RecurrenceFreq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

ALTER TABLE "Task" ADD COLUMN "recurrenceFreq" "RecurrenceFreq";
ALTER TABLE "Task" ADD COLUMN "recurrenceEndDate" TIMESTAMP(3);
