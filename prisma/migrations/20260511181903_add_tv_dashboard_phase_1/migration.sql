-- AlterTable
ALTER TABLE "client_profiles" ADD COLUMN     "showOnTv" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tv_control_state" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "pinnedPanel" TEXT,
    "shoutout" TEXT,
    "shoutoutExpiresAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tv_control_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tv_control_state_branchId_key" ON "tv_control_state"("branchId");

-- AddForeignKey
ALTER TABLE "tv_control_state" ADD CONSTRAINT "tv_control_state_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
