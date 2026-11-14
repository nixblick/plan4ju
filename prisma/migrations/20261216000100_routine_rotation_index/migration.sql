-- Position of an occurrence in the rotation of its routine, so that a rebuild after a rule change
-- continues the sequence instead of recounting. Existing rows take over the order by date.
ALTER TABLE "routine_occurrence" ADD COLUMN "rotationIndex" INTEGER NOT NULL DEFAULT 0;

UPDATE "routine_occurrence" o
SET "rotationIndex" = r.rn
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "routineId" ORDER BY date) - 1)::int AS rn
  FROM "routine_occurrence"
) r
WHERE o.id = r.id;
