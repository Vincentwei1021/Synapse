// Pure, testable seam for ExecutionRow. Kept in a JSX-free .ts file because the
// repo's vitest/Vite setup honors tsconfig `jsx: "preserve"` and cannot import a
// .tsx module that contains JSX (matches the existing *.helpers.ts test pattern).
export function experimentHref(researchProjectUuid: string, experimentUuid: string): string {
  return `/research-projects/${researchProjectUuid}/experiments?selected=${experimentUuid}`;
}
