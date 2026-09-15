-- Newly uploaded media stays private until the owner saves the story.
ALTER TABLE "Media" ADD COLUMN "attached" BOOLEAN NOT NULL DEFAULT false;
