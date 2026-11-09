-- Data only (no schema change): a milestone with subtasks now spans them.
--   Start    = earliest subtask start
--   Due      = latest subtask due
--   Duration = working days from Start to Due (Work Calendar weekdays, minus holidays)
-- Runs once, so existing milestones match the new rule straight away.
WITH spans AS (
  SELECT c."parentId" AS id,
         MIN(c."startDate") AS start_at,
         MAX(c."dueDate")   AS due_at
  FROM "Task" c
  WHERE c."deletedAt" IS NULL AND c."parentId" IS NOT NULL
  GROUP BY c."parentId"
),
targets AS (
  SELECT m.id, s.start_at, COALESCE(s.due_at, m."dueDate") AS due_at
  FROM "Task" m
  JOIN spans s ON s.id = m.id
  WHERE m."isMilestone" = true AND m."deletedAt" IS NULL AND s.start_at IS NOT NULL
)
UPDATE "Task" t
SET "startDate" = tg.start_at,
    "dueDate"   = tg.due_at,
    "durationDays" = GREATEST(1, (
      SELECT COUNT(*)
      FROM generate_series(date_trunc('day', tg.start_at), date_trunc('day', tg.due_at), interval '1 day') AS d(day)
      WHERE COALESCE(
              (SELECT CASE EXTRACT(DOW FROM d.day)::int
                        WHEN 0 THEN w.sun WHEN 1 THEN w.mon WHEN 2 THEN w.tue WHEN 3 THEN w.wed
                        WHEN 4 THEN w.thu WHEN 5 THEN w.fri ELSE w.sat END
               FROM "WorkWeekConfig" w WHERE w.id = 'singleton'),
              EXTRACT(DOW FROM d.day)::int BETWEEN 0 AND 4)
        AND NOT EXISTS (SELECT 1 FROM "Holiday" h WHERE date_trunc('day', h."date") = d.day)
    ))
FROM targets tg
WHERE t.id = tg.id AND tg.due_at IS NOT NULL;
