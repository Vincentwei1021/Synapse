# Agent Activity Glow — Flowing Edge Light

**Date:** 2026-04-16
**Status:** Draft
**Scope:** Related Works page, Experiments page

## Summary

When an agent is actively working on a task, the corresponding UI element displays a flowing edge light (conic-gradient border animation) in the agent's assigned color. This provides immediate, in-place visual feedback — users see the status exactly where they dispatched the task, without navigating to another page.

## Design Decisions

- **In-place only** — no new pages, no global indicator. Status shows on the same page where the task was dispatched.
- **Visual style** — flowing conic-gradient light rotating around the element's border. Subtle and elegant, does not compete with content.
- **Color = agent identity** — each agent gets a fixed color derived from its UUID hash. Same agent always has the same color across all pages.
- **No agent name label** — color alone identifies the agent. Keeps the UI clean.
- **Two pages first** — Related Works and Experiments. Documents and Insights deferred.

## Agent Color System

8-color palette assigned by `hash(agentUuid) % 8`:

| Index | Name    | Hex       |
|-------|---------|-----------|
| 0     | Blue    | `#3b82f6` |
| 1     | Violet  | `#8b5cf6` |
| 2     | Pink    | `#ec4899` |
| 3     | Orange  | `#f97316` |
| 4     | Emerald | `#10b981` |
| 5     | Cyan    | `#06b6d4` |
| 6     | Yellow  | `#eab308` |
| 7     | Rose    | `#f43f5e` |

Each color entry also has a lighter variant used in the gradient tail (e.g. `#8b5cf6` → `#c084fc`).

### Implementation

A shared utility function `getAgentColor(agentUuid: string): { primary: string; light: string }` that:
1. Hashes the UUID to a stable integer
2. Maps to one of the 8 palette entries
3. Returns primary + light color pair

This lives in a shared location (e.g. `src/lib/agent-colors.ts`) so both pages use the same mapping.

## Glow Component

A reusable React component `<GlowBorder>` that wraps any child content with the flowing edge light effect.

### Props

```typescript
interface GlowBorderProps {
  active: boolean;         // show/hide the glow animation
  primaryColor: string;    // e.g. "#8b5cf6"
  lightColor: string;      // e.g. "#c084fc" (gradient tail)
  children: React.ReactNode;
}
```

### CSS technique

Uses `@property --angle` to animate a `conic-gradient` on a pseudo-element or wrapper div positioned at `inset: -2px` behind the content:

```css
@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

.glow-border-ring {
  background: conic-gradient(
    from var(--angle),
    transparent 60%,
    var(--primary-color) 80%,
    var(--light-color) 90%,
    transparent 100%
  );
  animation: glow-spin 3s linear infinite;
}

@keyframes glow-spin {
  from { --angle: 0deg; }
  to   { --angle: 360deg; }
}
```

The inner content div sits on top with the page background color, creating the border illusion.

### Completion animation

When the agent finishes work, instead of abruptly removing the glow:
1. **Accelerate** — animation duration drops from 3s to 0.5s for one final rotation
2. **Flash** — border briefly glows fully (full ring lit) for ~300ms
3. **Fade out** — opacity transitions to 0 over ~700ms, returning to normal card appearance

Total transition: ~1.5s. Triggered by `active` prop changing from `true` to `false` (component internally detects the transition and plays the exit sequence before unmounting the glow).

## Page Integration

### 1. Related Works Page

**File:** `src/app/(dashboard)/research-projects/[uuid]/related-works/related-works-client.tsx`

**Auto-search active:**
- Wrap the auto-search toggle/control area with `<GlowBorder>`
- `active` = `true` while `searchingPapers` state is true
- Color comes from the auto-search agent's UUID via `getAgentColor()`

**Deep Research active:**
- Wrap the deep research control area with `<GlowBorder>`
- `active` = `true` while `generatingDeepResearch` state is true
- Color comes from the selected deep research agent's UUID

**Data source:** These pages already track `searchingPapers` / `generatingDeepResearch` boolean states and know the assigned agent UUID. No new API calls needed.

### 2. Experiments Page

**File:** `src/app/(dashboard)/research-projects/[uuid]/experiments/experiments-board.tsx`

**Experiment cards:**
- Wrap each experiment card with `<GlowBorder>`
- `active` = `true` when experiment `status === 'in_progress'` AND `liveStatus` is one of: `sent`, `ack`, `checking_resources`, `queuing`, `running`
- Color comes from the experiment's `assignedAgentUuid` via `getAgentColor()`
- Multiple agents working simultaneously → multiple cards glow in different colors

**Autonomous loop indicator:**
- The existing autonomous loop status area can also be wrapped with `<GlowBorder>` when the loop is active
- Color comes from `autonomousLoopAgentUuid`

**Data source:** Experiment cards already receive `liveStatus` and `assignedAgentUuid` via the existing realtime SSE infrastructure. No new API calls needed.

## What's NOT in Scope

- Global-level agent activity indicator (sidebar/topbar)
- Documents page glow
- Insights page glow
- Agent name labels on cards
- Detailed progress log display (already exists separately in experiment detail panel)
- New API endpoints or data model changes

## Light/Dark Mode

The glow effect naturally works best on dark backgrounds. For light mode:
- Reduce glow opacity slightly (0.7x)
- Inner content background matches the light theme surface color
- The colored border is still visible against light backgrounds

## Browser Compatibility

`@property` is supported in Chrome 85+, Edge 85+, Safari 15.4+, Firefox 128+. For older browsers that don't support `@property`, the element will simply show a static border (graceful degradation — the gradient won't animate but the colors still appear).
