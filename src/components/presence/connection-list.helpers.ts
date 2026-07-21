// Pure, testable seam for ConnectionList. Kept in a JSX-free .ts file because the
// repo's vitest/Vite setup honors tsconfig `jsx: "preserve"` and cannot import a
// .tsx module that contains JSX (matches the existing *.helpers.ts test pattern).
export function connectionStatusLabel(c: { status: "online" | "offline" }): "online" | "offline" {
  return c.status;
}
