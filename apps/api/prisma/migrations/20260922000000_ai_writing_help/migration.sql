-- Consent and usage records for the optional AI writing help.
ALTER TABLE "Admin" ADD COLUMN "aiConsentAt" TIMESTAMP(3);

CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_adminId_createdAt_idx" ON "AiUsage"("adminId", "createdAt");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
