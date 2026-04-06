import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ uuid: string }> };

export const GET = withErrorHandler(async (request: NextRequest, context: RouteContext) => {
  const auth = await getAuthContext(request);
  if (!auth) return errors.unauthorized();

  const { uuid: projectUuid } = await context.params;
  const project = await prisma.researchProject.findFirst({
    where: { uuid: projectUuid, companyUuid: auth.companyUuid },
    select: { repoUrl: true, githubToken: true },
  });

  if (!project) return errors.notFound("Research Project");
  if (!project.repoUrl || !project.githubToken) {
    return success({ branches: [] });
  }

  const match = project.repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!match) return success({ branches: [] });

  const [, owner, repo] = match;

  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${project.githubToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Synapse",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return success({ branches: [], error: `GitHub API: ${resp.status}` });
    }

    const data = await resp.json() as Array<{ name: string; commit: { sha: string } }>;
    const branches = data.map((b) => ({ name: b.name, sha: b.commit.sha }));
    return success({ branches });
  } catch {
    return success({ branches: [], error: "Failed to fetch branches" });
  }
});
