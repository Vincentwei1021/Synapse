import { NextRequest } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { createComputePool, listComputePools } from "@/services/compute.service";

const poolSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

// Restricted to users only — agents must use MCP synapse_list_compute_nodes
export const GET = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Agents must use MCP synapse_list_compute_nodes for compute access");
  }

  const pools = await listComputePools(auth.companyUuid);
  return success({ pools });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can register compute pools");
  }

  const body = await request.json();
  const parsed = poolSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  const pool = await createComputePool({
    companyUuid: auth.companyUuid,
    ...parsed.data,
  });

  return success({ pool });
});
