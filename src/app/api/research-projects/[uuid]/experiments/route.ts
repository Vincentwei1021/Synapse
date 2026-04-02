import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, paginated, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { createExperiment, listExperiments, updateExperiment, type ExperimentAttachment } from "@/services/experiment.service";
import { researchProjectExists } from "@/services/research-project.service";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  }, schema.optional());

const createExperimentSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  researchQuestionUuid: z.string().optional(),
  status: z.enum(["draft", "pending_review", "pending_start"]).default("pending_start"),
  priority: z.string().default("medium"),
  computeBudgetHours: optionalNumber(z.coerce.number().min(0)),
});

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function persistAttachment(
  companyUuid: string,
  projectUuid: string,
  experimentUuid: string,
  file: File,
): Promise<ExperimentAttachment> {
  const dir = path.join(homedir(), ".synapse", "uploads", "experiments", companyUuid, projectUuid, experimentUuid);
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}-${sanitizeFileName(file.name)}`;
  const storedPath = path.join(dir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(storedPath, buffer);

  return {
    originalName: file.name,
    storedPath,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler<{ uuid: string }>(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const { uuid: researchProjectUuid } = await context.params;
  if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
    return errors.notFound("Research Project");
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || "1");
  const pageSize = Number(url.searchParams.get("pageSize") || "100");
  const status = url.searchParams.get("status") || undefined;
  const skip = (page - 1) * pageSize;

  const result = await listExperiments({
    companyUuid: auth.companyUuid,
    researchProjectUuid,
    status: status as never,
    skip,
    take: pageSize,
  });

  return paginated(result.experiments, page, pageSize, result.total);
});

export const POST = withErrorHandler<{ uuid: string }>(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can create experiments");
  }

  const { uuid: researchProjectUuid } = await context.params;
  if (!(await researchProjectExists(auth.companyUuid, researchProjectUuid))) {
    return errors.notFound("Research Project");
  }

  const formData = await request.formData();
  const parsed = createExperimentSchema.safeParse({
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    researchQuestionUuid: String(formData.get("researchQuestionUuid") || ""),
    status: String(formData.get("status") || "pending_start"),
    priority: String(formData.get("priority") || "medium"),
    computeBudgetHours: formData.get("computeBudgetHours"),
  });

  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  const experiment = await createExperiment({
    companyUuid: auth.companyUuid,
    researchProjectUuid,
    researchQuestionUuid: parsed.data.researchQuestionUuid || null,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    computeBudgetHours: parsed.data.computeBudgetHours ?? null,
    createdByUuid: auth.actorUuid,
    createdByType: "user",
  });

  const attachments = await Promise.all(
    formData
      .getAll("attachments")
      .filter((file): file is File => file instanceof File && file.size > 0)
      .map((file) => persistAttachment(auth.companyUuid, researchProjectUuid, experiment.uuid, file)),
  );

  const updated = attachments.length
    ? await updateExperiment(auth.companyUuid, experiment.uuid, { attachments }, { actorType: "user", actorUuid: auth.actorUuid })
    : experiment;

  return success({ experiment: updated });
});
