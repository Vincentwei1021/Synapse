import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { researchProjectExists } from "@/services/research-project.service";
import {
  listRelatedWorks,
  createRelatedWork,
  fetchArxivMetadata,
} from "@/services/related-work.service";

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();

    const { uuid } = await context.params;
    if (!(await researchProjectExists(auth.companyUuid, uuid))) {
      return errors.notFound("Research Project");
    }

    const works = await listRelatedWorks(auth.companyUuid, uuid);
    return success({ relatedWorks: works });
  },
);

const createSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  authors: z.string().optional(),
  abstract: z.string().optional(),
  arxivId: z.string().optional(),
  source: z.string().default("arxiv"),
});

export const POST = withErrorHandler<{ uuid: string }>(
  async (request: NextRequest, context: RouteContext) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();

    const { uuid } = await context.params;
    if (!(await researchProjectExists(auth.companyUuid, uuid))) {
      return errors.notFound("Research Project");
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errors.validationError(parsed.error.flatten().fieldErrors);
    }

    let { title, authors, abstract: abs, arxivId } = parsed.data;
    const { source } = parsed.data;
    if (!title) {
      const meta = await fetchArxivMetadata(parsed.data.url);
      if (meta) {
        title = meta.title;
        authors = authors || meta.authors;
        abs = abs || meta.abstract;
        arxivId = arxivId || meta.arxivId;
      }
    }

    if (!title) {
      return errors.validationError({
        title: "Title is required (could not auto-fetch from URL)",
      });
    }

    const rw = await createRelatedWork({
      companyUuid: auth.companyUuid,
      researchProjectUuid: uuid,
      title,
      authors,
      abstract: abs,
      url: parsed.data.url,
      arxivId,
      source,
      addedBy: isUser(auth) ? "manual" : "auto",
      addedByAgentUuid: isUser(auth) ? null : auth.actorUuid,
    });

    return success({ relatedWork: rw });
  },
);
