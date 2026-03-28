import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
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
  sshKeySource: z.enum(["ssh_config", "upload", "manual_path"]).optional(),
  ssmTarget: z.string().optional(),
  notes: z.string().optional(),
}).refine((value) => Boolean(value.sshHost || value.ssmTarget), {
  message: "Either SSH host or SSM target is required.",
  path: ["sshHost"],
});

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function persistPemFile(companyUuid: string, sshHost: string, file: File) {
  const dir = path.join(homedir(), ".synapse", "keys", companyUuid, randomUUID());
  await mkdir(dir, { recursive: true });

  const fileName = sanitizeFileName(file.name || `${sshHost}.pem`);
  const fullPath = path.join(dir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer, { mode: 0o600 });
  await chmod(fullPath, 0o600);

  return {
    sshKeyPath: fullPath,
    sshKeyName: fileName,
    sshKeyFingerprint: createHash("sha256").update(buffer).digest("hex"),
    sshKeySource: "upload" as const,
  };
}

async function parsePayload(request: NextRequest, companyUuid: string) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const sshHost = String(formData.get("sshHost") || "");
    const sshKeyPath = String(formData.get("sshKeyPath") || "");
    const pemFile = formData.get("pemFile");

    let pemMeta:
      | {
          sshKeyPath: string;
          sshKeyName: string;
          sshKeyFingerprint: string;
          sshKeySource: "upload";
        }
      | undefined;

    if (pemFile instanceof File && pemFile.size > 0) {
      pemMeta = await persistPemFile(companyUuid, sshHost || "machine", pemFile);
    }

    return {
      poolUuid: String(formData.get("poolUuid") || ""),
      label: String(formData.get("label") || ""),
      ec2InstanceId: String(formData.get("ec2InstanceId") || ""),
      instanceType: String(formData.get("instanceType") || ""),
      region: String(formData.get("region") || ""),
      lifecycle: String(formData.get("lifecycle") || "idle"),
      sshHost,
      sshUser: String(formData.get("sshUser") || ""),
      sshPort: String(formData.get("sshPort") || ""),
      sshKeyPath: pemMeta?.sshKeyPath || sshKeyPath,
      sshKeyName: pemMeta?.sshKeyName,
      sshKeyFingerprint: pemMeta?.sshKeyFingerprint,
      sshKeySource:
        pemMeta?.sshKeySource || (String(formData.get("sshKeySource") || "") as "ssh_config" | "manual_path" | ""),
      ssmTarget: String(formData.get("ssmTarget") || ""),
      notes: String(formData.get("notes") || ""),
    };
  }

  return request.json();
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("Only users can register compute nodes");
  }

  const body = await parsePayload(request, auth.companyUuid);
  const parsed = nodeSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validationError(parsed.error.flatten().fieldErrors);
  }

  const node = await createComputeNode({
    companyUuid: auth.companyUuid,
    ...parsed.data,
    sshKeyName: typeof body.sshKeyName === "string" ? body.sshKeyName : undefined,
    sshKeyFingerprint: typeof body.sshKeyFingerprint === "string" ? body.sshKeyFingerprint : undefined,
    label: parsed.data.label?.trim() || parsed.data.sshHost || parsed.data.ssmTarget || "research-machine",
  });

  return success({
    node,
    key:
      node.sshKeyPath && (node.sshKeyName || node.sshKeySource)
        ? {
            // Never expose server filesystem path to clients
            name: node.sshKeyName,
            source: node.sshKeySource,
            fingerprint: node.sshKeyFingerprint,
          }
        : null,
  });
}
