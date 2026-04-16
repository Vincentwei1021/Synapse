# Agent Activity Glow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flowing edge light animation (conic-gradient) around UI elements when an agent is actively working, colored by agent identity, on the Related Works and Experiments pages.

**Architecture:** A shared color utility (`agent-colors.ts`) maps agent UUIDs to a fixed 8-color palette. A reusable `<GlowBorder>` client component wraps any element with the animated border effect. Both target pages integrate `<GlowBorder>` around their existing card/control elements, driven by existing state (no new API calls).

**Tech Stack:** React 19, Tailwind CSS 4, CSS `@property` + `conic-gradient`, Next.js client components

---

### Task 1: Create `getAgentColor` utility

**Files:**
- Create: `src/lib/agent-colors.ts`
- Create: `src/lib/__tests__/agent-colors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/agent-colors.test.ts
import { describe, it, expect } from "vitest";
import { getAgentColor, AGENT_COLOR_PALETTE } from "@/lib/agent-colors";

describe("getAgentColor", () => {
  it("returns a color pair with primary and light keys", () => {
    const color = getAgentColor("550e8400-e29b-41d4-a716-446655440000");
    expect(color).toHaveProperty("primary");
    expect(color).toHaveProperty("light");
    expect(color.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.light).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns the same color for the same UUID", () => {
    const a = getAgentColor("550e8400-e29b-41d4-a716-446655440000");
    const b = getAgentColor("550e8400-e29b-41d4-a716-446655440000");
    expect(a).toEqual(b);
  });

  it("returns a valid palette entry for any UUID", () => {
    const uuids = [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "12345678-1234-1234-1234-123456789abc",
    ];
    for (const uuid of uuids) {
      const color = getAgentColor(uuid);
      const match = AGENT_COLOR_PALETTE.find((c) => c.primary === color.primary && c.light === color.light);
      expect(match).toBeDefined();
    }
  });

  it("returns a fallback color for empty string", () => {
    const color = getAgentColor("");
    expect(color).toHaveProperty("primary");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/__tests__/agent-colors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/agent-colors.ts
export const AGENT_COLOR_PALETTE = [
  { primary: "#3b82f6", light: "#60a5fa" },  // Blue
  { primary: "#8b5cf6", light: "#c084fc" },  // Violet
  { primary: "#ec4899", light: "#f472b6" },  // Pink
  { primary: "#f97316", light: "#fb923c" },  // Orange
  { primary: "#10b981", light: "#34d399" },  // Emerald
  { primary: "#06b6d4", light: "#22d3ee" },  // Cyan
  { primary: "#eab308", light: "#facc15" },  // Yellow
  { primary: "#f43f5e", light: "#fb7185" },  // Rose
] as const;

function hashUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getAgentColor(agentUuid: string): { primary: string; light: string } {
  if (!agentUuid) return AGENT_COLOR_PALETTE[0];
  const index = hashUuid(agentUuid) % AGENT_COLOR_PALETTE.length;
  return AGENT_COLOR_PALETTE[index];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/__tests__/agent-colors.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-colors.ts src/lib/__tests__/agent-colors.test.ts
git commit -m "feat: add agent color palette utility"
```

---

### Task 2: Create `<GlowBorder>` component

**Files:**
- Create: `src/components/glow-border.tsx`

- [ ] **Step 1: Create the GlowBorder component**

```tsx
// src/components/glow-border.tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface GlowBorderProps {
  active: boolean;
  primaryColor: string;
  lightColor: string;
  className?: string;
  children: React.ReactNode;
}

export function GlowBorder({ active, primaryColor, lightColor, className, children }: GlowBorderProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "accelerate" | "flash" | "fadeout">("idle");
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) {
      // Became active
      setPhase("running");
    } else if (!active && prevActive.current) {
      // Became inactive — play exit sequence
      setPhase("accelerate");
      const t1 = setTimeout(() => setPhase("flash"), 500);
      const t2 = setTimeout(() => setPhase("fadeout"), 800);
      const t3 = setTimeout(() => setPhase("idle"), 1500);
      prevActive.current = active;
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    } else if (active) {
      setPhase("running");
    }
    prevActive.current = active;
  }, [active]);

  if (phase === "idle") {
    return <div className={className}>{children}</div>;
  }

  const animationDuration = phase === "accelerate" ? "0.5s" : "3s";
  const ringOpacity = phase === "fadeout" ? 0 : phase === "flash" ? 1 : 0.85;

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Glow ring */}
      <div
        className="absolute -inset-[2px] rounded-[18px] transition-opacity"
        style={{
          background: phase === "flash"
            ? `conic-gradient(from 0deg, ${primaryColor}, ${lightColor}, ${primaryColor})`
            : `conic-gradient(from var(--glow-angle), transparent 60%, ${primaryColor} 80%, ${lightColor} 90%, transparent 100%)`,
          opacity: ringOpacity,
          animation: phase === "flash" || phase === "fadeout"
            ? "none"
            : `glow-spin ${animationDuration} linear infinite`,
          transitionDuration: phase === "fadeout" ? "700ms" : "200ms",
        }}
      />
      {/* Content */}
      <div className="relative">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Add the CSS `@property` rule and keyframe**

We need to add the `@property --glow-angle` and `@keyframes glow-spin` globally. Add them to `src/app/globals.css`:

Find the end of the existing content in `src/app/globals.css` and append:

```css
/* Agent activity glow animation */
@property --glow-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes glow-spin {
  from { --glow-angle: 0deg; }
  to { --glow-angle: 360deg; }
}
```

- [ ] **Step 3: Verify the component renders without errors**

Start the dev server and verify no build errors:

Run: `pnpm dev`
Expected: Compiles without errors. The component is not yet used on any page.

- [ ] **Step 4: Commit**

```bash
git add src/components/glow-border.tsx src/app/globals.css
git commit -m "feat: add GlowBorder component with flowing edge light animation"
```

---

### Task 3: Integrate glow on Related Works page

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/related-works/related-works-client.tsx`

- [ ] **Step 1: Add imports**

At the top of `related-works-client.tsx`, add:

```typescript
import { GlowBorder } from "@/components/glow-border";
import { getAgentColor } from "@/lib/agent-colors";
```

- [ ] **Step 2: Wrap auto-search Card with GlowBorder**

Replace the auto-search Card block (currently lines 285–339). Change the outer `<Card>` to be wrapped by `<GlowBorder>`:

Find:
```tsx
        <Card className="rounded-2xl border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">
                  {t("autoSearch")}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("autoSearchDesc")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => openPromptDialog("search")}
              title={t("editPrompt")}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
```

Replace with:
```tsx
        <GlowBorder
          active={searchingPapers}
          primaryColor={getAgentColor(autoSearchAgentUuid).primary}
          lightColor={getAgentColor(autoSearchAgentUuid).light}
        >
        <Card className="rounded-2xl border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium text-foreground">
                  {t("autoSearch")}
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("autoSearchDesc")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => openPromptDialog("search")}
              title={t("editPrompt")}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
```

And after the closing `</Card>` for auto-search (line 339), add `</GlowBorder>`:

Find:
```tsx
        </Card>

        {/* Deep Research control */}
```

Replace with:
```tsx
        </Card>
        </GlowBorder>

        {/* Deep Research control */}
```

- [ ] **Step 3: Wrap deep research Card with GlowBorder**

Same pattern for the deep research Card. Before the `<Card>` at line 342:

Find:
```tsx
        {/* Deep Research control */}
        <Card className="rounded-2xl border-border bg-card p-5">
```

Replace with:
```tsx
        {/* Deep Research control */}
        <GlowBorder
          active={generatingDeepResearch}
          primaryColor={getAgentColor(deepResearchAgentUuid).primary}
          lightColor={getAgentColor(deepResearchAgentUuid).light}
        >
        <Card className="rounded-2xl border-border bg-card p-5">
```

And after the closing `</Card>` for deep research (line 405):

Find:
```tsx
        </Card>
      </div>
```

Replace with:
```tsx
        </Card>
        </GlowBorder>
      </div>
```

- [ ] **Step 4: Test in browser**

1. Navigate to a research project's Related Works page
2. Select an agent in the auto-search dropdown
3. Click "Search" — the auto-search card should glow with the agent's color
4. The glow should animate smoothly and stop when the task completes
5. Repeat for deep research

Run: Open `http://<synapse-test>:3000/research-projects/<uuid>/related-works` in browser

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/research-projects/\[uuid\]/related-works/related-works-client.tsx
git commit -m "feat: add agent activity glow to Related Works page"
```

---

### Task 4: Integrate glow on Experiments board

**Files:**
- Modify: `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`

- [ ] **Step 1: Add imports**

At the top of `experiments-board.tsx`, add:

```typescript
import { GlowBorder } from "@/components/glow-border";
import { getAgentColor } from "@/lib/agent-colors";
```

- [ ] **Step 2: Wrap experiment cards with GlowBorder**

In the card rendering section (around line 625), wrap each `<Card>` with `<GlowBorder>`. The glow is active when the experiment has a non-null `liveStatus`.

Find:
```tsx
                  grouped[column.id].map((experiment) => (
                    <Card
                      key={experiment.uuid}
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); };
                        }
                      }}
                      className="space-y-3 rounded-2xl border-border bg-card p-3.5 text-left shadow-none transition-colors hover:border-primary/30"
                    >
```

Replace with:
```tsx
                  grouped[column.id].map((experiment) => (
                    <GlowBorder
                      key={experiment.uuid}
                      active={!!experiment.liveStatus}
                      primaryColor={getAgentColor(experiment.assignee?.uuid ?? "").primary}
                      lightColor={getAgentColor(experiment.assignee?.uuid ?? "").light}
                    >
                    <Card
                      role="button"
                      tabIndex={0}
                      onClick={() => { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          { setSelectedExperimentUuid(experiment.uuid); setDismissed(false); };
                        }
                      }}
                      className="space-y-3 rounded-2xl border-border bg-card p-3.5 text-left shadow-none transition-colors hover:border-primary/30"
                    >
```

And after the closing `</Card>` for each experiment card (around line 669):

Find:
```tsx
                      {renderActionBlock(experiment)}
                    </Card>
                  ))
```

Replace with:
```tsx
                      {renderActionBlock(experiment)}
                    </Card>
                    </GlowBorder>
                  ))
```

- [ ] **Step 3: Wrap autonomous loop indicator with GlowBorder**

Wrap the autonomous loop active state button (line 486) with a glow. Find the active state container:

Find:
```tsx
            {loopEnabled ? (
              /* ACTIVE: showing mode + agent + phase + stop */
              <div className="flex items-center">
                <button
                  onClick={() => setLoopDropdownOpen(!loopDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 cursor-pointer transition-all duration-200"
                >
```

Replace with:
```tsx
            {loopEnabled ? (
              /* ACTIVE: showing mode + agent + phase + stop */
              <GlowBorder
                active={loopEnabled}
                primaryColor={getAgentColor(loopAgentUuid).primary}
                lightColor={getAgentColor(loopAgentUuid).light}
              >
              <div className="flex items-center">
                <button
                  onClick={() => setLoopDropdownOpen(!loopDropdownOpen)}
                  className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 cursor-pointer transition-all duration-200"
                >
```

And close the GlowBorder after the active state `</div>` (around line 514):

Find:
```tsx
              </div>
            ) : (
```

Replace with:
```tsx
              </div>
              </GlowBorder>
            ) : (
```

- [ ] **Step 4: Check ExperimentResponse includes assignee uuid**

Verify that `ExperimentResponse` type includes `assignee?.uuid`. Read `src/services/experiment.service.ts` to confirm the type shape. If `assignee` only has `name` and not `uuid`, we need to also expose `uuid` in the assignee field. Check the existing type and adjust if needed.

- [ ] **Step 5: Test in browser**

1. Navigate to a research project's Experiments page
2. Verify cards with `liveStatus` (in_progress experiments) show the glow
3. Verify different agents produce different glow colors
4. Verify the autonomous loop indicator glows when enabled
5. Verify completed/idle cards have no glow
6. Verify the exit animation plays when an experiment completes

Run: Open `http://<synapse-test>:3000/research-projects/<uuid>/experiments` in browser

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/research-projects/\[uuid\]/experiments/experiments-board.tsx
git commit -m "feat: add agent activity glow to Experiments board"
```

---

### Task 5: Visual polish and both-theme verification

- [ ] **Step 1: Test both themes in browser**

1. Switch to light mode in Settings
2. Verify the glow is visible but not overpowering on light backgrounds
3. Switch back to dark mode
4. Verify the glow looks good on dark backgrounds
5. If light mode glow is too intense, reduce `ringOpacity` base from `0.85` to `0.65` and re-test

- [ ] **Step 2: Commit if any adjustments were made**

```bash
git add src/components/glow-border.tsx
git commit -m "fix: polish GlowBorder visual for both themes"
```

---

### Task 6: Final verification and sync

- [ ] **Step 1: Run type check**

Run: `pnpm build`
Expected: No type errors, build succeeds

- [ ] **Step 2: Run existing tests**

Run: `pnpm test`
Expected: All existing tests pass, plus the new `agent-colors.test.ts`

- [ ] **Step 3: Sync to synapse remote and push**

```bash
rsync -az --exclude .env --exclude node_modules --exclude .next /Users/weiyihao/personal/Synapse/ synapse:/home/ubuntu/Synapse/
ssh synapse 'cd /home/ubuntu/Synapse && git add -A && git commit -m "feat: agent activity glow — flowing edge light for Related Works and Experiments" && git push -u origin session/2026-04-16-agent-activity-glow'
```

- [ ] **Step 4: Sync to synapse-test and verify**

```bash
ssh synapse-test 'cd /home/ubuntu/Synapse && git fetch && git checkout session/2026-04-16-agent-activity-glow && git pull && pnpm install'
```

Start dev server on synapse-test and do a final browser test of both pages.

- [ ] **Step 5: Sync local**

```bash
git fetch && git checkout session/2026-04-16-agent-activity-glow && git reset --hard origin/session/2026-04-16-agent-activity-glow
```
