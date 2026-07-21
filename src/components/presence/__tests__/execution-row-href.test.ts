import { describe, it, expect } from "vitest";
// Imported from the JSX-free helper module: the repo's vitest/Vite config honors
// tsconfig `jsx: "preserve"` and cannot import the .tsx component directly.
// execution-row.tsx re-exports experimentHref from this same module.
import { experimentHref } from "@/components/presence/execution-row.helpers";

describe("experimentHref", () => {
  it("builds the experiment deep-link with selected param", () => {
    expect(experimentHref("proj-1", "exp-1")).toBe(
      "/research-projects/proj-1/experiments?selected=exp-1",
    );
  });
});
