-- Tracks whether the "due tomorrow" reminder email was already sent for a
-- task's current dueDate (see src/app/api/cron/notify/route.ts).
ALTER TABLE "Task" ADD COLUMN "dueSoonNotifiedAt" TIMESTAMP(3);
