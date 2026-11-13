-- Existing assignments must not count as "new" after the rollout: date them back to their task's creation.
UPDATE "task_assignment" a SET "createdAt" = t."createdAt" FROM "task" t WHERE t."id" = a."taskId";
