-- AlterTable: add lifecycle status to research projects
ALTER TABLE "Project"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "completedAt" TIMESTAMP(3);
