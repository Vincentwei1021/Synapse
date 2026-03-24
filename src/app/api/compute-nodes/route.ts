import { NextRequest } from "next/server";
import { z } from "zod";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";
import { createComputeNode } from "@/services/compute.service";

const optionalNumber = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }
    return value;
  }, schema.optional());

const nodeSchema = z.object({
  poolUuid: z.string().min(1),
  label: z.string().optional(),
  ec2InstanceId: z.string().optional(),
  instanceType: z.string().optional(),
  region: z.string().optional(),
  lifecycle: z.enum(["idle", "offline", "maintenance"]).default("idle"),
  sshHost: z.string().optional(),
  sshUser: z.string().optional(),
  sshPort: optionalNumber(z.coerce.number().int().min(1).max(65535)),
  sshKeyPath: z.string().optional(),
  ssmTarget: z.string().optional(),
  notes: z.string().optional(),
}).refine((value) => Boolean(value.sshHost || value.ssmTarget), {
  message: "Either SSH host or SSM target is required.",
  path: ["sshHost"],
});

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can register compute nodes");
  }

  const body = await request.json();
  const parsed = nodeSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  const node = await createComputeNode({
    companyUuid: auth.companyUuid,
    ...parsed.data,
    label: parsed.data.label?.trim() || parsed.data.sshHost || parsed.data.ssmTarget || "research-machine",
  });

  return success({ node });
}
