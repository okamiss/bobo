-- Persist reusable tags independently from stories so unused fixed tags stay selectable.
CREATE TABLE "Tag" (
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("name")
);

-- Backfill the catalog from every public, private and draft story.
INSERT INTO "Tag" ("name", "updatedAt")
SELECT DISTINCT tag, CURRENT_TIMESTAMP
FROM "Entry", unnest("Entry"."tags") AS tag
WHERE tag <> ''
ON CONFLICT ("name") DO NOTHING;
