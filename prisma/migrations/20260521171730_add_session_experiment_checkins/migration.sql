-- CreateTable
CREATE TABLE "SessionExperimentCheckin" (
    "id" SERIAL NOT NULL,
    "sessionUuid" TEXT NOT NULL,
    "experimentUuid" TEXT NOT NULL,
    "checkinAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkoutAt" TIMESTAMP(3),

    CONSTRAINT "SessionExperimentCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionExperimentCheckin_sessionUuid_experimentUuid_key" ON "SessionExperimentCheckin"("sessionUuid", "experimentUuid");

-- CreateIndex
CREATE INDEX "SessionExperimentCheckin_sessionUuid_idx" ON "SessionExperimentCheckin"("sessionUuid");

-- CreateIndex
CREATE INDEX "SessionExperimentCheckin_experimentUuid_idx" ON "SessionExperimentCheckin"("experimentUuid");
