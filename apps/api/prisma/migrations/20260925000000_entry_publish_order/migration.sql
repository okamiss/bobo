-- Stories on the same day are now ordered by when they were published, so a
-- published story must always carry that stamp. Rows published before the
-- field was recorded fall back to when they were written.
UPDATE "Entry"
SET "publishedAt" = "createdAt"
WHERE "status" = 'published' AND "publishedAt" IS NULL;

-- The timeline reads one day at a time, newest first.
CREATE INDEX IF NOT EXISTS "Entry_occurredOn_publishedAt_idx"
ON "Entry" ("occurredOn" DESC, "publishedAt" DESC);
