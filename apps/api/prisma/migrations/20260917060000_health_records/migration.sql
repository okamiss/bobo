-- Private health records for vaccines, deworming, checkups and grooming.
CREATE TABLE "HealthRecord" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredOn" TEXT NOT NULL,
    "nextDueOn" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HealthRecord_nextDueOn_idx" ON "HealthRecord"("nextDueOn");
CREATE INDEX "HealthRecord_occurredOn_idx" ON "HealthRecord"("occurredOn");
