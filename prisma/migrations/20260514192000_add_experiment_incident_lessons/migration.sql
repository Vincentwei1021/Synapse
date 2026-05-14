-- CreateTable
CREATE TABLE "ExperimentIncidentLesson" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "experimentUuid" TEXT NOT NULL,
    "phase" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL,
    "failureType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "symptom" TEXT NOT NULL,
    "rootCause" TEXT,
    "resolution" TEXT,
    "prevention" TEXT,
    "evidenceSummary" TEXT,
    "experimentOutcomeImpact" TEXT,
    "tags" JSONB,
    "createdByUuid" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL DEFAULT 'agent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentIncidentLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentIncidentLesson_uuid_key" ON "ExperimentIncidentLesson"("uuid");

-- CreateIndex
CREATE INDEX "ExperimentIncidentLesson_companyUuid_idx" ON "ExperimentIncidentLesson"("companyUuid");

-- CreateIndex
CREATE INDEX "ExperimentIncidentLesson_projectUuid_idx" ON "ExperimentIncidentLesson"("projectUuid");

-- CreateIndex
CREATE INDEX "ExperimentIncidentLesson_experimentUuid_idx" ON "ExperimentIncidentLesson"("experimentUuid");

-- CreateIndex
CREATE INDEX "ExperimentIncidentLesson_failureType_idx" ON "ExperimentIncidentLesson"("failureType");

-- CreateIndex
CREATE INDEX "ExperimentIncidentLesson_status_idx" ON "ExperimentIncidentLesson"("status");

-- CreateIndex
CREATE INDEX "ExperimentIncidentLesson_search_idx" ON "ExperimentIncidentLesson" USING GIN (
  to_tsvector(
    'simple',
    coalesce("title", '') || ' ' ||
    coalesce("symptom", '') || ' ' ||
    coalesce("rootCause", '') || ' ' ||
    coalesce("resolution", '') || ' ' ||
    coalesce("prevention", '') || ' ' ||
    coalesce("evidenceSummary", '') || ' ' ||
    coalesce("failureType", '') || ' ' ||
    coalesce("phase", '')
  )
);
