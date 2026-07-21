// packages/synapse-daemon/src/__tests__/smoke.test.ts
import { describe, it, expect } from "vitest";
import { runDaemon } from "../index";

describe("runDaemon", () => {
  it("is a function that resolves for --help", async () => {
    expect(typeof runDaemon).toBe("function");
    await expect(runDaemon(["--help"])).resolves.toBeUndefined();
  });
});
