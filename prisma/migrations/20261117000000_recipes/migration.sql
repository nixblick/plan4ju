-- Recipes (release 0.3). Ingredients reference (recipeId, familyId), so an ingredient row can never point at a recipe of another family.
-- CreateTable
CREATE TABLE "recipe" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "servings" INTEGER,
    "prepMinutes" INTEGER,
    "steps" TEXT[],
    "tags" TEXT[],
    "allergens" TEXT,
    "imageUrl" TEXT,
    "sourceUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredient" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "recipe_ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_familyId_title_idx" ON "recipe"("familyId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_id_familyId_key" ON "recipe"("id", "familyId");

-- CreateIndex
CREATE INDEX "recipe_ingredient_recipeId_position_idx" ON "recipe_ingredient"("recipeId", "position");

-- AddForeignKey
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipeId_familyId_fkey" FOREIGN KEY ("recipeId", "familyId") REFERENCES "recipe"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

