-- Notification for the assigning person when an assignment is declined (issue 16). Own migration:
-- a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "NotificationKind" ADD VALUE 'DECLINED';
