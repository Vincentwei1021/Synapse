import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { errors, success } from "@/lib/api-response";
import { getAuthContext, isUser } from "@/lib/auth";

type SshEntry = {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
};

function parseSshConfig(config: string) {
  const entries: SshEntry[] = [];
  let current: SshEntry | null = null;

  const pushCurrent = () => {
    if (current?.alias && !current.alias.includes("*") && !current.alias.includes("?")) {
      entries.push(current);
    }
  };

  for (const rawLine of config.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const [directive, ...rest] = line.split(/\s+/);
    const value = rest.join(" ").trim();
    const key = directive.toLowerCase();

    if (key === "host") {
      pushCurrent();
      const alias = value.split(/\s+/)[0] ?? "";
      current = alias ? { alias } : null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (key === "hostname") {
      current.hostName = value;
    } else if (key === "user") {
      current.user = value;
    } else if (key === "port") {
      const port = Number(value);
      current.port = Number.isFinite(port) ? port : undefined;
    } else if (key === "identityfile") {
      current.identityFile = value.replace(/^~\//, `${os.homedir()}/`);
    }
  }

  pushCurrent();
  return entries;
}

// User-only — reading server SSH config is an admin operation, not for agents
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) {
    return errors.unauthorized();
  }
  if (!isUser(auth)) {
    return errors.forbidden("SSH config access is restricted to users");
  }

  const sshConfigPath = path.join(os.homedir(), ".ssh", "config");
  if (!fs.existsSync(sshConfigPath)) {
    return success({ hosts: [] });
  }

  const contents = fs.readFileSync(sshConfigPath, "utf8");
  const hosts = parseSshConfig(contents);

  // Strip identityFile paths — only expose alias/host/user/port
  const sanitizedHosts = hosts.map(({ identityFile: _removed, ...rest }) => rest);

  return success({ hosts: sanitizedHosts });
}
