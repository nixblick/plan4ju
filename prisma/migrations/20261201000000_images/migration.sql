-- Uploaded pictures for recipes and wishes. Stored in the database (bytea), served only through a route that
-- checks the family; the image belongs to exactly one recipe or wish and goes away with it (cascade).

CREATE TABLE "image" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "recipeId" TEXT,
    "wishId" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "image_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "image_one_owner" CHECK (num_nonnulls("recipeId", "wishId") = 1),
    CONSTRAINT "image_mime" CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp')),
    CONSTRAINT "image_size" CHECK ("size" > 0 AND "size" <= 5242880)
);

CREATE UNIQUE INDEX "image_id_familyId_key" ON "image"("id", "familyId");
CREATE UNIQUE INDEX "image_recipeId_key" ON "image"("recipeId");
CREATE UNIQUE INDEX "image_wishId_key" ON "image"("wishId");
CREATE INDEX "image_familyId_idx" ON "image"("familyId");

ALTER TABLE "image" ADD CONSTRAINT "image_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "image" ADD CONSTRAINT "image_recipeId_familyId_fkey"
  FOREIGN KEY ("recipeId", "familyId") REFERENCES "recipe"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "image" ADD CONSTRAINT "image_wishId_familyId_fkey"
  FOREIGN KEY ("wishId", "familyId") REFERENCES "wish"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "image" TO plan4ju_app;
ALTER TABLE "image" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "image" FORCE ROW LEVEL SECURITY;
CREATE POLICY family_scope ON "image"
  USING ("familyId" = app_family_id()) WITH CHECK ("familyId" = app_family_id());
