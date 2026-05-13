-- CreateTable
CREATE TABLE "tv_events" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "icon" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tv_events_branchId_isActive_eventAt_idx" ON "tv_events"("branchId", "isActive", "eventAt");

-- AddForeignKey
ALTER TABLE "tv_events" ADD CONSTRAINT "tv_events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
