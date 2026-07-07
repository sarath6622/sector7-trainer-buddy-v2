-- CreateTable
CREATE TABLE "mobile_refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "platform" TEXT,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByJti" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_refresh_tokens_jti_key" ON "mobile_refresh_tokens"("jti");

-- CreateIndex
CREATE INDEX "mobile_refresh_tokens_userId_idx" ON "mobile_refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "mobile_refresh_tokens_familyId_idx" ON "mobile_refresh_tokens"("familyId");

-- AddForeignKey
ALTER TABLE "mobile_refresh_tokens" ADD CONSTRAINT "mobile_refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
