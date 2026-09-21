-- Daily AI allowance per account, adjustable by the family owner instead of
-- being fixed in the code. 0 turns the feature off for everyone.
ALTER TABLE "Profile" ADD COLUMN "aiDraftQuota" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Profile" ADD COLUMN "aiChatQuota" INTEGER NOT NULL DEFAULT 50;
