import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { createComputePool, listComputePools } from "@/services/compute.service";

const poolSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }

  const pools = await listComputePools(auth.companyUuid);
  return success({ pools });
}

export async function POST(request: NextRequest) {
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
}
