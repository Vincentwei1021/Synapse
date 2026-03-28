import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import fs from "node:fs";
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
  sshConfigAlias: z.string().optional(), // SSH config alias — server resolves to host/user/port/keyPath
  sshKeySource: z.enum(["ssh_config", "upload"]).optional(), // manual_path removed
  ssmTarget: z.string().optional(),
  notes: z.string().optional(),
}).refine((value) => Boolean(value.sshHost || value.ssmTarget || value.sshConfigAlias), {
  message: "Either SSH host, SSH config alias, or SSM target is required.",
  path: ["sshHost"],
});

interface SshConfigEntry {
  hostName: string;
  user: string;
  port: number;
  identityFile: string | null;
}

/** Resolve an SSH config alias to connection details, server-side only */
function resolveSshConfigAlias(alias: string): SshConfigEntry | null {
  const configPath = path.join(homedir(), ".ssh", "config");
  if (!fs.existsSync(configPath)) return null;

  const content = fs.readFileSync(configPath, "utf8");
  const lines = content.split(/\r?\n/);
  let matched = false;
  let hostName: string | undefined;
  let user: string | undefined;
  let port: number | undefined;
  let identityFile: string | undefined;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const spaceIdx = trimmed.search(/\s/);
    if (spaceIdx === -1) continue;
    const directive = trimmed.slice(0, spaceIdx).toLowerCase();
    const value = trimmed.slice(spaceIdx).trim();

    if (directive === "host") {
      if (matched) break; // we already found our block, stop
      matched = value.split(/\s+/)[0] === alias;
      continue;
    }
    if (!matched) continue;
    if (directive === "hostname") hostName = value;
    else if (directive === "user") user = value;
    else if (directive === "port") port = Number(value) || undefined;
    else if (directive === "identityfile") identityFile = value.replace(/^~\//, `${homedir()}/`);
  }

  if (!hostName) return null;
  return { hostName, user: user ?? "ubuntu", port: port ?? 22, identityFile: identityFile ?? null };
}

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
      sshConfigAlias: String(formData.get("sshConfigAlias") || ""),
      pemKeyPath: pemMeta?.sshKeyPath,
      pemKeyName: pemMeta?.sshKeyName,
      pemKeyFingerprint: pemMeta?.sshKeyFingerprint,
      sshKeySource:
        pemMeta?.sshKeySource || (String(formData.get("sshKeySource") || "") as "ssh_config" | ""),
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

  // Resolve SSH config alias server-side — frontend never sees identityFile paths
  let resolvedSshKeyPath: string | undefined;
  let resolvedSshKeyName: string | undefined;
  let resolvedSshKeyFingerprint: string | undefined;
  let finalSshHost = parsed.data.sshHost;
  let finalSshUser = parsed.data.sshUser;
  let finalSshPort = parsed.data.sshPort;

  if (parsed.data.sshConfigAlias && parsed.data.sshKeySource === "ssh_config") {
    const resolved = resolveSshConfigAlias(parsed.data.sshConfigAlias);
    if (!resolved) {
      return errors.badRequest(`SSH config alias "${parsed.data.sshConfigAlias}" not found`);
    }
    finalSshHost = finalSshHost || resolved.hostName;
    finalSshUser = finalSshUser || resolved.user;
    finalSshPort = finalSshPort ?? resolved.port;
    if (resolved.identityFile) {
      resolvedSshKeyPath = resolved.identityFile;
      resolvedSshKeyName = path.basename(resolved.identityFile);
      try {
        const keyContent = await readFile(resolved.identityFile);
        resolvedSshKeyFingerprint = createHash("sha256").update(keyContent).digest("hex");
      } catch {
        // Key file not readable — node will be created but managedKeyAvailable = false
      }
    }
  }

  // For PEM upload, use the persisted file metadata
  if (body.pemKeyPath) {
    resolvedSshKeyPath = body.pemKeyPath;
    resolvedSshKeyName = body.pemKeyName;
    resolvedSshKeyFingerprint = body.pemKeyFingerprint;
  }

  const node = await createComputeNode({
    companyUuid: auth.companyUuid,
    poolUuid: parsed.data.poolUuid,
    label: parsed.data.label?.trim() || finalSshHost || parsed.data.ssmTarget || "research-machine",
    ec2InstanceId: parsed.data.ec2InstanceId,
    instanceType: parsed.data.instanceType,
    region: parsed.data.region,
    lifecycle: parsed.data.lifecycle,
    sshHost: finalSshHost,
    sshUser: finalSshUser,
    sshPort: finalSshPort,
    sshKeyPath: resolvedSshKeyPath,
    sshKeyName: resolvedSshKeyName,
    sshKeyFingerprint: resolvedSshKeyFingerprint,
    sshKeySource: parsed.data.sshKeySource,
    ssmTarget: parsed.data.ssmTarget,
    notes: parsed.data.notes,
  });

  return success({
    node: {
      uuid: node.uuid,
      label: node.label,
      lifecycle: node.lifecycle,
    },
    key: resolvedSshKeyPath
      ? { name: resolvedSshKeyName, source: parsed.data.sshKeySource }
      : null,
  });
}
