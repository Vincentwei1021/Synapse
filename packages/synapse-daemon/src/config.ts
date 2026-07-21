export interface DaemonConfig {
  synapseUrl: string;
  apiKey: string;
  yolo: boolean;
  model: string | null;
  cwd: string;
}

export interface ResolveConfigInput {
  env: Record<string, string | undefined>;
  argv: string[];
  fileContents?: string | null;
  cwd: string;
}

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

export function resolveConfig(input: ResolveConfigInput): DaemonConfig {
  let file: Record<string, unknown> = {};
  if (input.fileContents) {
    try {
      file = JSON.parse(input.fileContents) as Record<string, unknown>;
    } catch {
      file = {};
    }
  }

  const url =
    flagValue(input.argv, "--url") ??
    input.env.SYNAPSE_URL ??
    (typeof file.synapseUrl === "string" ? file.synapseUrl : undefined);
  const key =
    flagValue(input.argv, "--key") ??
    input.env.SYNAPSE_API_KEY ??
    (typeof file.apiKey === "string" ? file.apiKey : undefined);

  if (!url) throw new Error("SYNAPSE_URL is required");
  if (!key) throw new Error("SYNAPSE_API_KEY is required");
  if (!key.startsWith("syn_")) throw new Error("SYNAPSE_API_KEY must start with syn_");

  const yolo = input.argv.includes("--yolo") || file.yolo === true;
  const model =
    flagValue(input.argv, "--model") ??
    (typeof file.model === "string" ? file.model : null);
  const cwd =
    flagValue(input.argv, "--cwd") ??
    (typeof file.cwd === "string" ? file.cwd : input.cwd);

  return {
    synapseUrl: url.replace(/\/$/, ""),
    apiKey: key,
    yolo,
    model,
    cwd,
  };
}
