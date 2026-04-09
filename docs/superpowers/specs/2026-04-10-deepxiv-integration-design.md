# DeepXiv Integration Design

**Date**: 2026-04-10
**Goal**: Replace Semantic Scholar + OpenAlex with DeepXiv as the primary paper search and reading source, enabling agents to read full paper content for higher-quality literature reviews.

## Motivation

Synapse's Related Works feature currently only stores paper metadata (title, abstract, authors). When agents generate deep research reports, they can only work from abstracts — insufficient for real literature review. DeepXiv provides structured full-text access to arXiv papers via HTTP API, with progressive reading (brief → head → section → raw) that lets agents control token budget.

Semantic Scholar and OpenAlex are removed as search sources because they return paywalled papers whose content cannot be accessed. arXiv API is kept as fallback for search only.

## Changes

### 1. `src/services/paper-search.service.ts` — Search Refactor

**Remove**: `searchSemanticScholar()`, `searchOpenAlex()`, `reconstructAbstract()`, related types and rate limiter entries.

**Add**: `searchDeepXiv(query, limit)` adapter calling `GET https://data.rag.ac.cn/search`.

**Update** `searchPapers()` flow:
```
DeepXiv search (primary)
  → if empty/failed → arXiv search (fallback)
  → deduplicatePapers()
```

`PaperResult.source` type adds `"deepxiv"`. Old values (`semantic_scholar`, `openalex`) remain valid for existing data.

### 2. `src/services/paper-search.service.ts` — Paper Reading Functions

New exported functions:

| Function | DeepXiv Endpoint | Returns |
|----------|-----------------|---------|
| `readPaperBrief(arxivId)` | `GET /paper/{id}/brief` | TLDR, keywords, citation count, GitHub URL |
| `readPaperHead(arxivId)` | `GET /paper/{id}/head` | Paper structure with per-section TLDRs and token counts |
| `readPaperSection(arxivId, section)` | `GET /paper/{id}/section/{name}` | Full text of one section |
| `readPaperFull(arxivId)` | `GET /paper/{id}/raw` | Complete paper as Markdown |

All functions use `fetchWithRetry()` with the DeepXiv base URL and optional `DEEPXIV_TOKEN` auth header.

### 3. `src/mcp/tools/literature.ts` — New MCP Tools

Register 4 new tools:

- `synapse_read_paper_brief` — input: `arxivId`
- `synapse_read_paper_head` — input: `arxivId`
- `synapse_read_paper_section` — input: `arxivId`, `sectionName`
- `synapse_read_paper_full` — input: `arxivId`

Update `synapse_search_papers` description to reflect DeepXiv as primary source.

### 4. `packages/openclaw-plugin/src/tools/common-tool-definitions.ts` — OpenClaw Registration

Add 4 passthrough tool definitions for the new reading tools.

Update `synapse_search_papers` description.
Update `synapse_add_related_work` source enum to include `"deepxiv"`.

### 5. `packages/openclaw-plugin/src/event-router.ts` — Agent Prompts

**Auto-search prompt**: Add reading tools to allowed list. Agent reads brief to assess relevance before adding.

**Deep research prompt**: Add all reading tools. Agent uses `head` to survey structure, `section` to read key parts, `full` only when needed. This enables writing literature reviews based on actual paper content, not just abstracts.

### 6. Configuration

`.env`: Add `DEEPXIV_TOKEN` (optional — anonymous gets 1,000 req/day, registered gets 10,000 req/day).

### Backward Compatibility

- `RelatedWork.source` keeps all existing values valid. New records will only use `arxiv` or `deepxiv`.
- `PaperResult.source` type union keeps old values for compile-time compat, but runtime only produces `arxiv` or `deepxiv`.
- No schema migration needed.
- No UI changes needed — source badges will naturally show new values.

### Out of Scope

- PMC (biomedical) paper support — can add later if needed
- Trending papers / social impact — not needed for current workflow
- DeepXiv built-in agent — Synapse has its own agent orchestration
