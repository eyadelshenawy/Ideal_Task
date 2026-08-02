-- Track when a comment (not an activity line) was edited after posting.
ALTER TABLE "TaskEvent" ADD COLUMN "editedAt" TIMESTAMP(3);
