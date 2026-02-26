-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "mentioned" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Mention" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUuid" TEXT NOT NULL,
    "mentionedType" TEXT NOT NULL,
    "mentionedUuid" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mention_uuid_key" ON "Mention"("uuid");

-- CreateIndex
CREATE INDEX "Mention_companyUuid_idx" ON "Mention"("companyUuid");

-- CreateIndex
CREATE INDEX "Mention_mentionedType_mentionedUuid_idx" ON "Mention"("mentionedType", "mentionedUuid");

-- CreateIndex
CREATE INDEX "Mention_sourceType_sourceUuid_idx" ON "Mention"("sourceType", "sourceUuid");
