-- CreateTable
CREATE TABLE "tv_announcements" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tv_announcements_branchId_isActive_idx" ON "tv_announcements"("branchId", "isActive");

-- AddForeignKey
ALTER TABLE "tv_announcements" ADD CONSTRAINT "tv_announcements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
