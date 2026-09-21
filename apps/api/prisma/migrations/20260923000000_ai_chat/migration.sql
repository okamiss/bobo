-- Per-account chat threads with the site. Facts about Bobo are shared by the
-- whole family, but a conversation is private to the account that started it.
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '新的聊天',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL DEFAULT '',
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "ms" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiConversation_adminId_updatedAt_idx" ON "AiConversation"("adminId", "updatedAt");

CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
