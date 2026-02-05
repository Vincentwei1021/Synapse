-- AlterTable
ALTER TABLE "Idea" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedBy" INTEGER,
ADD COLUMN     "assigneeId" INTEGER,
ADD COLUMN     "assigneeType" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedBy" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'open';

-- CreateIndex
CREATE INDEX "Idea_status_idx" ON "Idea"("status");

-- CreateIndex
CREATE INDEX "Idea_assigneeId_idx" ON "Idea"("assigneeId");
