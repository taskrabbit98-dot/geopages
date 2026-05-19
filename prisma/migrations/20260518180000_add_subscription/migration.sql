-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyChargeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trialEndsAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shop_key" ON "Subscription"("shop");
