-- Six priority levels instead of three, and the per-task switch for the dashboard calendar.
-- Existing values are mapped: HIGH -> DRINGEND, NORMAL -> ZEITNAH, LOW -> BEI_GELEGENHEIT.
CREATE TYPE "TaskPriority_new" AS ENUM ('SOFORT', 'DRINGEND', 'ZEITNAH', 'DEMNAECHST', 'BEI_GELEGENHEIT', 'IRGENDWANN');
ALTER TABLE "task" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "task" ALTER COLUMN "priority" TYPE "TaskPriority_new" USING (CASE "priority"::text WHEN 'HIGH' THEN 'DRINGEND' WHEN 'NORMAL' THEN 'ZEITNAH' WHEN 'LOW' THEN 'BEI_GELEGENHEIT' ELSE 'ZEITNAH' END)::"TaskPriority_new";
DROP TYPE "TaskPriority";
ALTER TYPE "TaskPriority_new" RENAME TO "TaskPriority";
ALTER TABLE "task" ALTER COLUMN "priority" SET DEFAULT 'ZEITNAH';
-- Existing tasks stay off the dashboard calendar until someone ticks the box.
ALTER TABLE "task" ADD COLUMN "showOnDashboard" BOOLEAN NOT NULL DEFAULT false;
