-- Growth curve: whether visitors can see it, and one measurement per day.
ALTER TABLE "Profile" ADD COLUMN "growthPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "measuredOn" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Measurement_measuredOn_key" ON "Measurement"("measuredOn");
