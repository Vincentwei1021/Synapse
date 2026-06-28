import { describe, it, expect } from "vitest";
import { resolveConfig } from "../config";

const base = { argv: [] as string[], fileContents: null, cwd: "/work" };

describe("resolveConfig", () => {
  it("reads url+key from env, strips trailing slash", () => {
    const c = resolveConfig({ ...base, env: { SYNAPSE_URL: "https://s.example/", SYNAPSE_API_KEY: "syn_abc" } });
    expect(c.synapseUrl).toBe("https://s.example");
    expect(c.apiKey).toBe("syn_abc");
    expect(c.yolo).toBe(false);
    expect(c.model).toBeNull();
    expect(c.cwd).toBe("/work");
  });

  it("argv overrides env; --yolo and --model parsed", () => {
    const c = resolveConfig({
      ...base,
      env: { SYNAPSE_URL: "https://env", SYNAPSE_API_KEY: "syn_env" },
      argv: ["--url", "https://flag", "--yolo", "--model", "opus", "--cwd", "/proj"],
    });
    expect(c.synapseUrl).toBe("https://flag");
    expect(c.yolo).toBe(true);
    expect(c.model).toBe("opus");
    expect(c.cwd).toBe("/proj");
  });

  it("falls back to file contents when env absent", () => {
    const c = resolveConfig({
      ...base,
      env: {},
      fileContents: JSON.stringify({ synapseUrl: "https://file", apiKey: "syn_file" }),
    });
    expect(c.synapseUrl).toBe("https://file");
    expect(c.apiKey).toBe("syn_file");
  });

  it("throws when url missing", () => {
    expect(() => resolveConfig({ ...base, env: { SYNAPSE_API_KEY: "syn_x" } })).toThrow(/SYNAPSE_URL is required/);
  });

  it("throws when key missing", () => {
    expect(() => resolveConfig({ ...base, env: { SYNAPSE_URL: "https://s" } })).toThrow(/SYNAPSE_API_KEY is required/);
  });

  it("throws when key has wrong prefix", () => {
    expect(() => resolveConfig({ ...base, env: { SYNAPSE_URL: "https://s", SYNAPSE_API_KEY: "bad" } })).toThrow(/must start with syn_/);
  });
});
