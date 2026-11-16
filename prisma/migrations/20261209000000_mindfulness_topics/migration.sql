-- Release 0.9 (customer feedback): three more mindfulness topics. Own migration, because a new enum value
-- cannot be used in the transaction that adds it.
ALTER TYPE "MindfulnessTopic" ADD VALUE IF NOT EXISTS 'MOVEMENT';
ALTER TYPE "MindfulnessTopic" ADD VALUE IF NOT EXISTS 'FRESH_AIR';
ALTER TYPE "MindfulnessTopic" ADD VALUE IF NOT EXISTS 'SOCIAL';
