-- Task codes must be unique (a NULL code doesn't count — Postgres unique
-- indexes allow any number of NULLs, so tasks without a code are unaffected).
CREATE UNIQUE INDEX "Task_code_key" ON "Task"("code");
