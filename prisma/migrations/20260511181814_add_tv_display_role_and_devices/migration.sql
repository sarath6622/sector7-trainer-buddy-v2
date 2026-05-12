-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'TV_DISPLAY';

-- CreateTable
CREATE TABLE "tv_devices" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tv_devices_tokenHash_key" ON "tv_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "tv_devices_branchId_idx" ON "tv_devices"("branchId");

-- AddForeignKey
ALTER TABLE "tv_devices" ADD CONSTRAINT "tv_devices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
