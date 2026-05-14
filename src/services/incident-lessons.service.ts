import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/event-bus";
import type { Prisma } from "@/generated/prisma/client";

export const INCIDENT_LESSONS_DOCUMENT_TYPE = "execution_incident_lessons";

export type IncidentLessonStatus = "resolved_in_run" | "unresolved" | "caused_failure";
export type IncidentLessonSeverity = "low" | "medium" | "high";
export type IncidentLessonSearchMode = "keyword" | "bm25" | "semantic" | "hybrid";

export interface IncidentLessonResponse {
  uuid: string;
  researchProjectUuid: string;
  experimentUuid: string;
  experimentTitle: string | null;
  phase: string | null;
  severity: string;
  status: string;
  failureType: string;
  title: string;
  symptom: string;
  rootCause: string | null;
  resolution: string | null;
  prevention: string | null;
  evidenceSummary: string | null;
  experimentOutcomeImpact: string | null;
  tags: string[];
  createdByUuid: string;
  createdByType: string;
  createdAt: string;
  updatedAt: string;
  rank?: number;
}

export interface RecordIncidentLessonInput {
  companyUuid: string;
  experimentUuid: string;
  title: string;
  failureType: string;
  status: IncidentLessonStatus;
  severity?: IncidentLessonSeverity;
  phase?: string | null;
  symptom: string;
  rootCause?: string | null;
  resolution?: string | null;
  prevention?: string | null;
  evidenceSummary?: string | null;
  experimentOutcomeImpact?: string | null;
  tags?: string[];
  createdByUuid: string;
  createdByType: string;
}

export interface SearchIncidentLessonsInput {
  companyUuid: string;
  researchProjectUuid: string;
  query?: string | null;
  failureType?: string | null;
  phase?: string | null;
  status?: string | null;
  severity?: string | null;
  tags?: string[];
  limit?: number;
  mode?: IncidentLessonSearchMode;
}

type IncidentLessonRecord = {
  uuid: string;
  researchProjectUuid: string;
  experimentUuid: string;
  experiment?: { title: string } | null;
  experimentTitle?: string | null;
  phase: string | null;
  severity: string;
  status: string;
  failureType: string;
  title: string;
  symptom: string;
  rootCause: string | null;
  resolution: string | null;
  prevention: string | null;
  evidenceSummary: string | null;
  experimentOutcomeImpact: string | null;
  tags: unknown;
  createdByUuid: string;
  createdByType: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  rank?: number | string;
};

function normalizeTags(tags?: string[] | null): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

function formatTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === "string");
}

function toDateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatIncidentLesson(record: IncidentLessonRecord): IncidentLessonResponse {
  return {
    uuid: record.uuid,
    researchProjectUuid: record.researchProjectUuid,
    experimentUuid: record.experimentUuid,
    experimentTitle: record.experiment?.title ?? record.experimentTitle ?? null,
    phase: record.phase ?? null,
    severity: record.severity,
    status: record.status,
    failureType: record.failureType,
    title: record.title,
    symptom: record.symptom,
    rootCause: record.rootCause ?? null,
    resolution: record.resolution ?? null,
    prevention: record.prevention ?? null,
    evidenceSummary: record.evidenceSummary ?? null,
    experimentOutcomeImpact: record.experimentOutcomeImpact ?? null,
    tags: formatTags(record.tags),
    createdByUuid: record.createdByUuid,
    createdByType: record.createdByType,
    createdAt: toDateString(record.createdAt),
    updatedAt: toDateString(record.updatedAt),
    ...(record.rank !== undefined ? { rank: Number(record.rank) } : {}),
  };
}

function markdownValue(value: string | null | undefined): string {
  return value && value.trim() ? value.trim() : "-";
}

function renderLessonsDocument(projectName: string, lessons: IncidentLessonResponse[]): string {
  const sections = lessons.map((lesson) => {
    const tags = lesson.tags.length ? lesson.tags.join(", ") : "-";
    return [
      `## ${lesson.title}`,
      "",
      `<!-- synapse:incident-lesson:${lesson.uuid} experiment:${lesson.experimentUuid} -->`,
      "",
      `- Experiment: ${markdownValue(lesson.experimentTitle)} (${lesson.experimentUuid})`,
      `- Status: ${lesson.status}`,
      `- Severity: ${lesson.severity}`,
      `- Phase: ${markdownValue(lesson.phase)}`,
      `- Type: ${lesson.failureType}`,
      `- Impact: ${markdownValue(lesson.experimentOutcomeImpact)}`,
      `- Symptom: ${markdownValue(lesson.symptom)}`,
      `- Root cause: ${markdownValue(lesson.rootCause)}`,
      `- Resolution: ${markdownValue(lesson.resolution)}`,
      `- Prevention: ${markdownValue(lesson.prevention)}`,
      `- Evidence: ${markdownValue(lesson.evidenceSummary)}`,
      `- Tags: ${tags}`,
    ].join("\n");
  });

  return [
    `# ${projectName} - Execution Incident Lessons`,
    "",
    "Recoverable incidents, unresolved execution issues, and failure lessons captured during experiment work.",
    "",
    ...sections,
  ].join("\n");
}

async function getScopedExperiment(companyUuid: string, experimentUuid: string) {
  const experiment = await prisma.experiment.findFirst({
    where: { uuid: experimentUuid, companyUuid },
    select: {
      uuid: true,
      title: true,
      researchProjectUuid: true,
      companyUuid: true,
    },
  });
  if (!experiment) {
    throw new Error("Experiment not found");
  }
  return experiment;
}

export async function refreshExecutionIncidentLessonsDocument(
  companyUuid: string,
  researchProjectUuid: string,
) {
  const [project, rawLessons, existing] = await Promise.all([
    prisma.researchProject.findFirst({
      where: { uuid: researchProjectUuid, companyUuid },
      select: { name: true },
    }),
    prisma.experimentIncidentLesson.findMany({
      where: { companyUuid, researchProjectUuid },
      include: { experiment: { select: { uuid: true, title: true } } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.document.findFirst({
      where: { companyUuid, researchProjectUuid, type: INCIDENT_LESSONS_DOCUMENT_TYPE },
      select: { uuid: true },
    }),
  ]);

  const projectName = project?.name ?? "Project";
  const content = renderLessonsDocument(projectName, rawLessons.map(formatIncidentLesson));

  if (existing) {
    await prisma.document.update({
      where: { uuid: existing.uuid },
      data: { content, title: `${projectName} - Execution Incident Lessons`, updatedAt: new Date() },
    });
    return existing.uuid;
  }

  const created = await prisma.document.create({
    data: {
      companyUuid,
      researchProjectUuid,
      title: `${projectName} - Execution Incident Lessons`,
      type: INCIDENT_LESSONS_DOCUMENT_TYPE,
      content,
      createdByUuid: "system",
    },
    select: { uuid: true },
  });
  return created.uuid;
}

export async function recordExperimentIncidentLesson(input: RecordIncidentLessonInput) {
  const experiment = await getScopedExperiment(input.companyUuid, input.experimentUuid);
  const tags = normalizeTags(input.tags);

  const created = await prisma.experimentIncidentLesson.create({
    data: {
      companyUuid: input.companyUuid,
      researchProjectUuid: experiment.researchProjectUuid,
      experimentUuid: experiment.uuid,
      title: input.title,
      failureType: input.failureType,
      status: input.status,
      severity: input.severity ?? "medium",
      phase: input.phase ?? null,
      symptom: input.symptom,
      rootCause: input.rootCause ?? null,
      resolution: input.resolution ?? null,
      prevention: input.prevention ?? null,
      evidenceSummary: input.evidenceSummary ?? null,
      experimentOutcomeImpact: input.experimentOutcomeImpact ?? null,
      tags,
      createdByUuid: input.createdByUuid,
      createdByType: input.createdByType,
    },
    include: { experiment: { select: { uuid: true, title: true } } },
  });

  await refreshExecutionIncidentLessonsDocument(input.companyUuid, experiment.researchProjectUuid);

  eventBus.emitChange({
    companyUuid: input.companyUuid,
    researchProjectUuid: experiment.researchProjectUuid,
    entityType: "experiment",
    entityUuid: experiment.uuid,
    action: "updated",
    actorUuid: input.createdByUuid,
  });

  return formatIncidentLesson(created);
}

export async function searchIncidentLessons(input: SearchIncidentLessonsInput) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const tags = normalizeTags(input.tags);
  const query = input.query?.trim() ?? "";

  const mode = input.mode ?? "keyword";

  if (mode !== "keyword" && mode !== "bm25") {
    throw new Error("Semantic incident search is not configured yet");
  }

  if (query) {
    const rows = await prisma.$queryRawUnsafe<IncidentLessonRecord[]>(
      `
      SELECT
        l."uuid",
        l."companyUuid",
        l."projectUuid" AS "researchProjectUuid",
        l."experimentUuid",
        l."phase",
        l."severity",
        l."status",
        l."failureType",
        l."title",
        l."symptom",
        l."rootCause",
        l."resolution",
        l."prevention",
        l."evidenceSummary",
        l."experimentOutcomeImpact",
        l."tags",
        l."createdByUuid",
        l."createdByType",
        l."createdAt",
        l."updatedAt",
        e."title" AS "experimentTitle",
        ts_rank_cd(
          to_tsvector(
            'simple',
            coalesce(l."title", '') || ' ' ||
            coalesce(l."symptom", '') || ' ' ||
            coalesce(l."rootCause", '') || ' ' ||
            coalesce(l."resolution", '') || ' ' ||
            coalesce(l."prevention", '') || ' ' ||
            coalesce(l."evidenceSummary", '') || ' ' ||
            coalesce(l."failureType", '') || ' ' ||
            coalesce(l."phase", '')
          ),
          websearch_to_tsquery('simple', $8)
        ) AS "rank"
      FROM "ExperimentIncidentLesson" l
      LEFT JOIN "Experiment" e ON e."uuid" = l."experimentUuid"
      WHERE l."companyUuid" = $1
        AND l."projectUuid" = $2
        AND ($3::text IS NULL OR l."failureType" = $3)
        AND ($4::text IS NULL OR l."status" = $4)
        AND ($5::text IS NULL OR l."phase" = $5)
        AND ($6::text IS NULL OR l."severity" = $6)
        AND (
          $7::text[] IS NULL
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(coalesce(l."tags", '[]'::jsonb)) tag
            WHERE tag = ANY($7::text[])
          )
        )
        AND to_tsvector(
          'simple',
          coalesce(l."title", '') || ' ' ||
          coalesce(l."symptom", '') || ' ' ||
          coalesce(l."rootCause", '') || ' ' ||
          coalesce(l."resolution", '') || ' ' ||
          coalesce(l."prevention", '') || ' ' ||
          coalesce(l."evidenceSummary", '') || ' ' ||
          coalesce(l."failureType", '') || ' ' ||
          coalesce(l."phase", '')
        ) @@ websearch_to_tsquery('simple', $8)
      ORDER BY "rank" DESC, l."updatedAt" DESC
      LIMIT $9
      `,
      input.companyUuid,
      input.researchProjectUuid,
      input.failureType ?? null,
      input.status ?? null,
      input.phase ?? null,
      input.severity ?? null,
      tags.length ? tags : null,
      query,
      limit,
    );

    return { lessons: rows.map(formatIncidentLesson), total: rows.length, mode };
  }

  const where: Prisma.ExperimentIncidentLessonWhereInput = {
    companyUuid: input.companyUuid,
    researchProjectUuid: input.researchProjectUuid,
    ...(input.failureType ? { failureType: input.failureType } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.phase ? { phase: input.phase } : {}),
    ...(input.severity ? { severity: input.severity } : {}),
  };

  if (tags.length) {
    where.tags = { array_contains: tags };
  }

  const [lessons, total] = await Promise.all([
    prisma.experimentIncidentLesson.findMany({
      where,
      include: { experiment: { select: { uuid: true, title: true } } },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
      take: limit,
    }),
    prisma.experimentIncidentLesson.count({ where }),
  ]);

  return { lessons: lessons.map(formatIncidentLesson), total, mode };
}

export async function getExperimentIncidentLessons(input: {
  companyUuid: string;
  experimentUuid: string;
}) {
  await getScopedExperiment(input.companyUuid, input.experimentUuid);
  const lessons = await prisma.experimentIncidentLesson.findMany({
    where: { companyUuid: input.companyUuid, experimentUuid: input.experimentUuid },
    include: { experiment: { select: { uuid: true, title: true } } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return lessons.map(formatIncidentLesson);
}
