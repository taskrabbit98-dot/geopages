-- CreateTable
CREATE TABLE "TrustLinkTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "urlTemplate" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustLinkTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrustLinkTemplate_shop_idx" ON "TrustLinkTemplate"("shop");
