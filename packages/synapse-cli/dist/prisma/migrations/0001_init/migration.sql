-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "oidcIssuer" TEXT,
    "oidcClientId" TEXT,
    "oidcEnabled" BOOLEAN NOT NULL DEFAULT false,
    "deepxivToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "oidcSub" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY['researcher']::TEXT[],
    "type" TEXT NOT NULL DEFAULT 'openclaw',
    "color" TEXT,
    "persona" TEXT,
    "systemPrompt" TEXT,
    "ownerUuid" TEXT,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "agentUuid" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT,
    "lastUsed" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectGroup" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT,
    "datasets" JSONB,
    "evaluationMethods" JSONB,
    "latestSynthesisAt" TIMESTAMP(3),
    "latestSynthesisIdeaCount" INTEGER,
    "latestSynthesisSummary" TEXT,
    "groupUuid" TEXT,
    "computePoolUuid" TEXT,
    "autonomousLoopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autonomousLoopAgentUuid" TEXT,
    "autonomousLoopMode" TEXT DEFAULT 'human_review',
    "autoSearchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoSearchAgentUuid" TEXT,
    "autoSearchActiveAgentUuid" TEXT,
    "autoSearchStartedAt" TIMESTAMP(3),
    "deepResearchDocUuid" TEXT,
    "deepResearchActiveAgentUuid" TEXT,
    "deepResearchStartedAt" TIMESTAMP(3),
    "repoUrl" TEXT,
    "githubUsername" TEXT,
    "githubToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "attachments" JSONB,
    "sourceType" TEXT NOT NULL DEFAULT 'human',
    "sourceLabel" TEXT,
    "generatedByAgentUuid" TEXT,
    "parentQuestionUuid" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewedByUuid" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeType" TEXT,
    "assigneeUuid" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedByUuid" TEXT,
    "elaborationDepth" TEXT,
    "elaborationStatus" TEXT,
    "hypothesisStatement" TEXT,
    "nullHypothesis" TEXT,
    "priorWork" TEXT,
    "researchType" TEXT,
    "createdByUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "proposalUuid" TEXT,
    "createdByUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "researchQuestionUuid" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "computeBudgetHours" DOUBLE PRECISION,
    "computeUsedHours" DOUBLE PRECISION,
    "attachments" JSONB,
    "results" JSONB,
    "outcome" TEXT,
    "assigneeType" TEXT,
    "assigneeUuid" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedByUuid" TEXT,
    "createdByUuid" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL DEFAULT 'user',
    "reviewedByUuid" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "liveStatus" TEXT,
    "liveMessage" TEXT,
    "liveUpdatedAt" TIMESTAMP(3),
    "baseBranch" TEXT,
    "experimentBranch" TEXT,
    "commitSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "acceptanceCriteria" TEXT,
    "assigneeType" TEXT,
    "assigneeUuid" TEXT,
    "assignedAt" TIMESTAMP(3),
    "assignedByUuid" TEXT,
    "proposalUuid" TEXT,
    "experimentConfig" JSONB,
    "experimentResults" JSONB,
    "baselineRunUuid" TEXT,
    "computeBudgetHours" DOUBLE PRECISION,
    "computeUsedHours" DOUBLE PRECISION,
    "outcome" TEXT,
    "earlyStopTriggered" BOOLEAN NOT NULL DEFAULT false,
    "createdByUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" SERIAL NOT NULL,
    "taskUuid" TEXT NOT NULL,
    "dependsOnUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptanceCriterion" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "taskUuid" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "devStatus" TEXT NOT NULL DEFAULT 'pending',
    "devEvidence" TEXT,
    "devMarkedByType" TEXT,
    "devMarkedBy" TEXT,
    "devMarkedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "evidence" TEXT,
    "markedByType" TEXT,
    "markedBy" TEXT,
    "markedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metricName" TEXT,
    "operator" TEXT,
    "threshold" DOUBLE PRECISION,
    "isEarlyStop" BOOLEAN NOT NULL DEFAULT false,
    "actualValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptanceCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "inputType" TEXT NOT NULL,
    "inputUuids" JSONB NOT NULL,
    "documentDrafts" JSONB,
    "taskDrafts" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdByUuid" TEXT NOT NULL,
    "createdByType" TEXT NOT NULL DEFAULT 'agent',
    "reviewedByUuid" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetUuid" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetUuid" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUuid" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "value" JSONB,
    "sessionUuid" TEXT,
    "sessionName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "agentUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputePool" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComputePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeNode" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "poolUuid" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ec2InstanceId" TEXT,
    "instanceType" TEXT,
    "region" TEXT,
    "lifecycle" TEXT NOT NULL DEFAULT 'idle',
    "sshHost" TEXT,
    "sshUser" TEXT,
    "sshPort" INTEGER,
    "sshKeyPath" TEXT,
    "sshKeyName" TEXT,
    "sshKeyFingerprint" TEXT,
    "sshKeySource" TEXT,
    "ssmTarget" TEXT,
    "notes" TEXT,
    "telemetryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telemetryError" TEXT,
    "lastReportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComputeNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputeGpu" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "nodeUuid" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "memoryGb" INTEGER,
    "lifecycle" TEXT NOT NULL DEFAULT 'available',
    "utilizationPercent" INTEGER,
    "memoryUsedGb" DOUBLE PRECISION,
    "temperatureC" INTEGER,
    "notes" TEXT,
    "lastReportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComputeGpu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunGpuReservation" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "runUuid" TEXT NOT NULL,
    "gpuUuid" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "RunGpuReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentGpuReservation" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "experimentUuid" TEXT NOT NULL,
    "gpuUuid" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "ExperimentGpuReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentProgressLog" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "experimentUuid" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "phase" TEXT,
    "actorUuid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentProgressLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatedWork" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "researchProjectUuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "abstract" TEXT,
    "url" TEXT NOT NULL,
    "arxivId" TEXT,
    "source" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "addedByAgentUuid" TEXT,
    "publishedYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatedWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTaskCheckin" (
    "id" SERIAL NOT NULL,
    "sessionUuid" TEXT NOT NULL,
    "taskUuid" TEXT NOT NULL,
    "checkinAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkoutAt" TIMESTAMP(3),

    CONSTRAINT "SessionTaskCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "projectUuid" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientUuid" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityUuid" TEXT NOT NULL,
    "entityTitle" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUuid" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerUuid" TEXT NOT NULL,
    "taskAssigned" BOOLEAN NOT NULL DEFAULT true,
    "taskStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "taskVerified" BOOLEAN NOT NULL DEFAULT true,
    "taskReopened" BOOLEAN NOT NULL DEFAULT true,
    "proposalSubmitted" BOOLEAN NOT NULL DEFAULT true,
    "proposalApproved" BOOLEAN NOT NULL DEFAULT true,
    "proposalRejected" BOOLEAN NOT NULL DEFAULT true,
    "ideaClaimed" BOOLEAN NOT NULL DEFAULT true,
    "commentAdded" BOOLEAN NOT NULL DEFAULT true,
    "elaborationRequested" BOOLEAN NOT NULL DEFAULT true,
    "elaborationAnswered" BOOLEAN NOT NULL DEFAULT true,
    "experimentCompleted" BOOLEAN NOT NULL DEFAULT true,
    "experimentAutoProposed" BOOLEAN NOT NULL DEFAULT true,
    "experimentStatusChanged" BOOLEAN NOT NULL DEFAULT true,
    "experimentProgress" BOOLEAN NOT NULL DEFAULT true,
    "synthesisUpdated" BOOLEAN NOT NULL DEFAULT true,
    "autoSearchCompleted" BOOLEAN NOT NULL DEFAULT true,
    "deepResearchCompleted" BOOLEAN NOT NULL DEFAULT true,
    "autonomousLoopTriggered" BOOLEAN NOT NULL DEFAULT true,
    "mentioned" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "ElaborationRound" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "ideaUuid" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_answers',
    "createdByType" TEXT NOT NULL,
    "createdByUuid" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElaborationRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElaborationQuestion" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "roundUuid" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "selectedOptionId" TEXT,
    "customText" TEXT,
    "answeredAt" TIMESTAMP(3),
    "answeredByType" TEXT,
    "answeredByUuid" TEXT,
    "issueType" TEXT,
    "issueDescription" TEXT,

    CONSTRAINT "ElaborationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentRegistry" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "researchProjectUuid" TEXT NOT NULL,
    "runUuid" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "environment" JSONB NOT NULL,
    "seed" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "artifacts" JSONB,
    "reproducible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" SERIAL NOT NULL,
    "uuid" TEXT NOT NULL,
    "companyUuid" TEXT NOT NULL,
    "researchProjectUuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "experimentUuid" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Baseline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_uuid_key" ON "Company"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "User_uuid_key" ON "User"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "User_oidcSub_key" ON "User"("oidcSub");

-- CreateIndex
CREATE INDEX "User_companyUuid_idx" ON "User"("companyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_uuid_key" ON "Agent"("uuid");

-- CreateIndex
CREATE INDEX "Agent_companyUuid_idx" ON "Agent"("companyUuid");

-- CreateIndex
CREATE INDEX "Agent_ownerUuid_idx" ON "Agent"("ownerUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_uuid_key" ON "ApiKey"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_companyUuid_idx" ON "ApiKey"("companyUuid");

-- CreateIndex
CREATE INDEX "ApiKey_agentUuid_idx" ON "ApiKey"("agentUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectGroup_uuid_key" ON "ProjectGroup"("uuid");

-- CreateIndex
CREATE INDEX "ProjectGroup_companyUuid_idx" ON "ProjectGroup"("companyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Project_uuid_key" ON "Project"("uuid");

-- CreateIndex
CREATE INDEX "Project_companyUuid_idx" ON "Project"("companyUuid");

-- CreateIndex
CREATE INDEX "Project_groupUuid_idx" ON "Project"("groupUuid");

-- CreateIndex
CREATE INDEX "Project_computePoolUuid_idx" ON "Project"("computePoolUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Idea_uuid_key" ON "Idea"("uuid");

-- CreateIndex
CREATE INDEX "Idea_companyUuid_idx" ON "Idea"("companyUuid");

-- CreateIndex
CREATE INDEX "Idea_projectUuid_idx" ON "Idea"("projectUuid");

-- CreateIndex
CREATE INDEX "Idea_status_idx" ON "Idea"("status");

-- CreateIndex
CREATE INDEX "Idea_assigneeUuid_idx" ON "Idea"("assigneeUuid");

-- CreateIndex
CREATE INDEX "Idea_reviewStatus_idx" ON "Idea"("reviewStatus");

-- CreateIndex
CREATE INDEX "Idea_parentQuestionUuid_idx" ON "Idea"("parentQuestionUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Document_uuid_key" ON "Document"("uuid");

-- CreateIndex
CREATE INDEX "Document_companyUuid_idx" ON "Document"("companyUuid");

-- CreateIndex
CREATE INDEX "Document_projectUuid_idx" ON "Document"("projectUuid");

-- CreateIndex
CREATE INDEX "Document_proposalUuid_idx" ON "Document"("proposalUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_uuid_key" ON "Experiment"("uuid");

-- CreateIndex
CREATE INDEX "Experiment_companyUuid_idx" ON "Experiment"("companyUuid");

-- CreateIndex
CREATE INDEX "Experiment_projectUuid_idx" ON "Experiment"("projectUuid");

-- CreateIndex
CREATE INDEX "Experiment_researchQuestionUuid_idx" ON "Experiment"("researchQuestionUuid");

-- CreateIndex
CREATE INDEX "Experiment_status_idx" ON "Experiment"("status");

-- CreateIndex
CREATE INDEX "Experiment_assigneeUuid_idx" ON "Experiment"("assigneeUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Task_uuid_key" ON "Task"("uuid");

-- CreateIndex
CREATE INDEX "Task_companyUuid_idx" ON "Task"("companyUuid");

-- CreateIndex
CREATE INDEX "Task_projectUuid_idx" ON "Task"("projectUuid");

-- CreateIndex
CREATE INDEX "Task_proposalUuid_idx" ON "Task"("proposalUuid");

-- CreateIndex
CREATE INDEX "Task_assigneeUuid_idx" ON "Task"("assigneeUuid");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "TaskDependency_taskUuid_idx" ON "TaskDependency"("taskUuid");

-- CreateIndex
CREATE INDEX "TaskDependency_dependsOnUuid_idx" ON "TaskDependency"("dependsOnUuid");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_taskUuid_dependsOnUuid_key" ON "TaskDependency"("taskUuid", "dependsOnUuid");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptanceCriterion_uuid_key" ON "AcceptanceCriterion"("uuid");

-- CreateIndex
CREATE INDEX "AcceptanceCriterion_taskUuid_idx" ON "AcceptanceCriterion"("taskUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_uuid_key" ON "Proposal"("uuid");

-- CreateIndex
CREATE INDEX "Proposal_companyUuid_idx" ON "Proposal"("companyUuid");

-- CreateIndex
CREATE INDEX "Proposal_projectUuid_idx" ON "Proposal"("projectUuid");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_uuid_key" ON "Comment"("uuid");

-- CreateIndex
CREATE INDEX "Comment_companyUuid_idx" ON "Comment"("companyUuid");

-- CreateIndex
CREATE INDEX "Comment_targetType_targetUuid_idx" ON "Comment"("targetType", "targetUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_uuid_key" ON "Activity"("uuid");

-- CreateIndex
CREATE INDEX "Activity_companyUuid_idx" ON "Activity"("companyUuid");

-- CreateIndex
CREATE INDEX "Activity_projectUuid_idx" ON "Activity"("projectUuid");

-- CreateIndex
CREATE INDEX "Activity_targetType_targetUuid_idx" ON "Activity"("targetType", "targetUuid");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_uuid_key" ON "AgentSession"("uuid");

-- CreateIndex
CREATE INDEX "AgentSession_companyUuid_idx" ON "AgentSession"("companyUuid");

-- CreateIndex
CREATE INDEX "AgentSession_agentUuid_idx" ON "AgentSession"("agentUuid");

-- CreateIndex
CREATE INDEX "AgentSession_status_idx" ON "AgentSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ComputePool_uuid_key" ON "ComputePool"("uuid");

-- CreateIndex
CREATE INDEX "ComputePool_companyUuid_idx" ON "ComputePool"("companyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeNode_uuid_key" ON "ComputeNode"("uuid");

-- CreateIndex
CREATE INDEX "ComputeNode_companyUuid_idx" ON "ComputeNode"("companyUuid");

-- CreateIndex
CREATE INDEX "ComputeNode_poolUuid_lifecycle_idx" ON "ComputeNode"("poolUuid", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeNode_companyUuid_ec2InstanceId_key" ON "ComputeNode"("companyUuid", "ec2InstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeGpu_uuid_key" ON "ComputeGpu"("uuid");

-- CreateIndex
CREATE INDEX "ComputeGpu_companyUuid_idx" ON "ComputeGpu"("companyUuid");

-- CreateIndex
CREATE INDEX "ComputeGpu_nodeUuid_lifecycle_idx" ON "ComputeGpu"("nodeUuid", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "ComputeGpu_nodeUuid_slotIndex_key" ON "ComputeGpu"("nodeUuid", "slotIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RunGpuReservation_uuid_key" ON "RunGpuReservation"("uuid");

-- CreateIndex
CREATE INDEX "RunGpuReservation_companyUuid_idx" ON "RunGpuReservation"("companyUuid");

-- CreateIndex
CREATE INDEX "RunGpuReservation_runUuid_releasedAt_idx" ON "RunGpuReservation"("runUuid", "releasedAt");

-- CreateIndex
CREATE INDEX "RunGpuReservation_gpuUuid_releasedAt_idx" ON "RunGpuReservation"("gpuUuid", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentGpuReservation_uuid_key" ON "ExperimentGpuReservation"("uuid");

-- CreateIndex
CREATE INDEX "ExperimentGpuReservation_companyUuid_idx" ON "ExperimentGpuReservation"("companyUuid");

-- CreateIndex
CREATE INDEX "ExperimentGpuReservation_experimentUuid_releasedAt_idx" ON "ExperimentGpuReservation"("experimentUuid", "releasedAt");

-- CreateIndex
CREATE INDEX "ExperimentGpuReservation_gpuUuid_releasedAt_idx" ON "ExperimentGpuReservation"("gpuUuid", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentProgressLog_uuid_key" ON "ExperimentProgressLog"("uuid");

-- CreateIndex
CREATE INDEX "ExperimentProgressLog_experimentUuid_createdAt_idx" ON "ExperimentProgressLog"("experimentUuid", "createdAt");

-- CreateIndex
CREATE INDEX "ExperimentProgressLog_companyUuid_idx" ON "ExperimentProgressLog"("companyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "RelatedWork_uuid_key" ON "RelatedWork"("uuid");

-- CreateIndex
CREATE INDEX "RelatedWork_companyUuid_idx" ON "RelatedWork"("companyUuid");

-- CreateIndex
CREATE INDEX "RelatedWork_researchProjectUuid_idx" ON "RelatedWork"("researchProjectUuid");

-- CreateIndex
CREATE INDEX "SessionTaskCheckin_sessionUuid_idx" ON "SessionTaskCheckin"("sessionUuid");

-- CreateIndex
CREATE INDEX "SessionTaskCheckin_taskUuid_idx" ON "SessionTaskCheckin"("taskUuid");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTaskCheckin_sessionUuid_taskUuid_key" ON "SessionTaskCheckin"("sessionUuid", "taskUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_uuid_key" ON "Notification"("uuid");

-- CreateIndex
CREATE INDEX "Notification_recipientType_recipientUuid_readAt_idx" ON "Notification"("recipientType", "recipientUuid", "readAt");

-- CreateIndex
CREATE INDEX "Notification_companyUuid_recipientUuid_idx" ON "Notification"("companyUuid", "recipientUuid");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityUuid_idx" ON "Notification"("entityType", "entityUuid");

-- CreateIndex
CREATE INDEX "Notification_projectUuid_idx" ON "Notification"("projectUuid");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_uuid_key" ON "NotificationPreference"("uuid");

-- CreateIndex
CREATE INDEX "NotificationPreference_companyUuid_idx" ON "NotificationPreference"("companyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_ownerType_ownerUuid_key" ON "NotificationPreference"("ownerType", "ownerUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_uuid_key" ON "Mention"("uuid");

-- CreateIndex
CREATE INDEX "Mention_companyUuid_idx" ON "Mention"("companyUuid");

-- CreateIndex
CREATE INDEX "Mention_mentionedType_mentionedUuid_idx" ON "Mention"("mentionedType", "mentionedUuid");

-- CreateIndex
CREATE INDEX "Mention_sourceType_sourceUuid_idx" ON "Mention"("sourceType", "sourceUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ElaborationRound_uuid_key" ON "ElaborationRound"("uuid");

-- CreateIndex
CREATE INDEX "ElaborationRound_ideaUuid_idx" ON "ElaborationRound"("ideaUuid");

-- CreateIndex
CREATE INDEX "ElaborationRound_companyUuid_idx" ON "ElaborationRound"("companyUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ElaborationQuestion_uuid_key" ON "ElaborationQuestion"("uuid");

-- CreateIndex
CREATE INDEX "ElaborationQuestion_roundUuid_idx" ON "ElaborationQuestion"("roundUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ElaborationQuestion_roundUuid_questionId_key" ON "ElaborationQuestion"("roundUuid", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentRegistry_uuid_key" ON "ExperimentRegistry"("uuid");

-- CreateIndex
CREATE INDEX "ExperimentRegistry_companyUuid_idx" ON "ExperimentRegistry"("companyUuid");

-- CreateIndex
CREATE INDEX "ExperimentRegistry_researchProjectUuid_idx" ON "ExperimentRegistry"("researchProjectUuid");

-- CreateIndex
CREATE INDEX "ExperimentRegistry_runUuid_idx" ON "ExperimentRegistry"("runUuid");

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_uuid_key" ON "Baseline"("uuid");

-- CreateIndex
CREATE INDEX "Baseline_companyUuid_idx" ON "Baseline"("companyUuid");

-- CreateIndex
CREATE INDEX "Baseline_researchProjectUuid_idx" ON "Baseline"("researchProjectUuid");

