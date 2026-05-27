-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "paperFeedActiveAgentUuid" TEXT,
ADD COLUMN     "paperFeedAgentUuid" TEXT,
ADD COLUMN     "paperFeedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paperFeedLastRunAt" TIMESTAMP(3),
ADD COLUMN     "paperFeedStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RelatedWork" ADD COLUMN     "addedNote" TEXT;

-- CreateTable
CREATE TABLE "PaperFeedRun" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "researchProjectUuid" TEXT NOT NULL,
    "agentUuid" TEXT NOT NULL,
    "feedDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "paperCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PaperFeedRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperFeedItem" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "researchProjectUuid" TEXT NOT NULL,
    "feedRunUuid" TEXT NOT NULL,
    "feedDate" DATE NOT NULL,
    "paperId" TEXT NOT NULL,
    "arxivId" TEXT,
    "title" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "abstract" TEXT NOT NULL,
    "paperUrl" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "relevanceNote" TEXT NOT NULL,
    "relatedWorkUuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperFeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaperFeedRun_uuid_key" ON "PaperFeedRun"("uuid");

-- CreateIndex
CREATE INDEX "PaperFeedRun_companyUuid_researchProjectUuid_idx" ON "PaperFeedRun"("companyUuid", "researchProjectUuid");

-- CreateIndex
CREATE INDEX "PaperFeedRun_status_startedAt_idx" ON "PaperFeedRun"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaperFeedRun_researchProjectUuid_feedDate_key" ON "PaperFeedRun"("researchProjectUuid", "feedDate");

-- CreateIndex
CREATE UNIQUE INDEX "PaperFeedItem_uuid_key" ON "PaperFeedItem"("uuid");

-- CreateIndex
CREATE INDEX "PaperFeedItem_researchProjectUuid_feedDate_idx" ON "PaperFeedItem"("researchProjectUuid", "feedDate");

-- CreateIndex
CREATE INDEX "PaperFeedItem_feedRunUuid_idx" ON "PaperFeedItem"("feedRunUuid");

-- CreateIndex
CREATE UNIQUE INDEX "PaperFeedItem_researchProjectUuid_paperId_key" ON "PaperFeedItem"("researchProjectUuid", "paperId");
