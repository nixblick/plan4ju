-- Shopping list: shops per family (ordered), entries, and the entry-shop assignment.

-- CreateTable
CREATE TABLE "shop" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_item" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "fromRecipes" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_item_shop" (
    "itemId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,

    CONSTRAINT "shopping_item_shop_pkey" PRIMARY KEY ("itemId","shopId")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_familyId_name_key" ON "shop"("familyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "shop_id_familyId_key" ON "shop"("id", "familyId");

-- CreateIndex
CREATE INDEX "shopping_item_familyId_done_clearedAt_idx" ON "shopping_item"("familyId", "done", "clearedAt");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_item_id_familyId_key" ON "shopping_item"("id", "familyId");

-- CreateIndex
CREATE INDEX "shopping_item_shop_familyId_idx" ON "shopping_item_shop"("familyId");

-- CreateIndex
CREATE INDEX "shopping_item_shop_shopId_idx" ON "shopping_item_shop"("shopId");

-- AddForeignKey
ALTER TABLE "shop" ADD CONSTRAINT "shop_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_item" ADD CONSTRAINT "shopping_item_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_item_shop" ADD CONSTRAINT "shopping_item_shop_itemId_familyId_fkey" FOREIGN KEY ("itemId", "familyId") REFERENCES "shopping_item"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_item_shop" ADD CONSTRAINT "shopping_item_shop_shopId_familyId_fkey" FOREIGN KEY ("shopId", "familyId") REFERENCES "shop"("id", "familyId") ON DELETE CASCADE ON UPDATE CASCADE;

