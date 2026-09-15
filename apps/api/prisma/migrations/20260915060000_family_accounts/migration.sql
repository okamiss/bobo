-- Existing administrators become family owners and existing stories remain attributed.
ALTER TABLE "Admin" ADD COLUMN "displayName" TEXT;
ALTER TABLE "Admin" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "Admin" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Admin" SET "displayName" = "username", "role" = 'owner';
ALTER TABLE "Admin" ALTER COLUMN "displayName" SET NOT NULL;

ALTER TABLE "Entry" ADD COLUMN "authorId" TEXT;
UPDATE "Entry"
SET "authorId" = (SELECT "id" FROM "Admin" ORDER BY "username" LIMIT 1)
WHERE "authorId" IS NULL;

CREATE INDEX "Entry_authorId_idx" ON "Entry"("authorId");
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
