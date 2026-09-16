-- Page covers can use images uploaded outside of any story.
ALTER TABLE "Media" ALTER COLUMN "entryId" DROP NOT NULL;

-- The about page previously reused the homepage cover; keep what visitors see.
ALTER TABLE "Profile" ADD COLUMN "aboutCoverMediaId" TEXT;
UPDATE "Profile" SET "aboutCoverMediaId" = "coverMediaId";
