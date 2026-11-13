-- Meal plan: configurable meal slots, planned meals (recipe or free text), cooks per meal.

-- CreateTable
CREATE TABLE "meal_slot" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "meal_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slotId" TEXT NOT NULL,
    "recipeId" TEXT,
    "text" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_cook" (
    "mealId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,

    CONSTRAINT "meal_cook_pkey" PRIMARY KEY ("mealId","profileId")
);

-- CreateIndex
CREATE UNIQUE INDEX "meal_slot_familyId_name_key" ON "meal_slot"("familyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "meal_slot_id_familyId_key" ON "meal_slot"("id", "familyId");

-- CreateIndex
CREATE INDEX "meal_familyId_date_idx" ON "meal"("familyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meal_familyId_date_slotId_key" ON "meal"("familyId", "date", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "meal_id_familyId_key" ON "meal"("id", "familyId");

-- CreateIndex
CREATE INDEX "meal_cook_familyId_idx" ON "meal_cook"("familyId");

-- AddForeignKey
ALTER TABLE "meal_slot" ADD CONSTRAINT "meal_slot_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal" ADD CONSTRAINT "meal_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal" ADD CONSTRAINT "meal_slotId_familyId_fkey" FOREIGN KEY ("slotId", "familyId") REFERENCES "meal_slot"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal" ADD CONSTRAINT "meal_recipeId_familyId_fkey" FOREIGN KEY ("recipeId", "familyId") REFERENCES "recipe"("id", "familyId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_cook" ADD CONSTRAINT "meal_cook_mealId_familyId_fkey" FOREIGN KEY ("mealId", "familyId") REFERENCES "meal"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_cook" ADD CONSTRAINT "meal_cook_profileId_familyId_fkey" FOREIGN KEY ("profileId", "familyId") REFERENCES "family_profile"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;


-- A meal is a recipe or a free text, never empty.
ALTER TABLE "meal" ADD CONSTRAINT "meal_recipe_or_text" CHECK ("recipeId" IS NOT NULL OR "text" IS NOT NULL);
