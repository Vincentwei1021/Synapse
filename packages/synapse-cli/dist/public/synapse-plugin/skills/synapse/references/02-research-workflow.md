# Research Workflow

This guide covers the pre-experiment research phase: creating research questions, formulating hypotheses, and managing literature.

---

## Research Questions

Research questions are the starting point of every project. They define what the project investigates.

### Viewing Questions

```
synapse_get_research_questions({ researchProjectUuid: "..." })
synapse_get_research_question({ researchQuestionUuid: "..." })
```

### Claiming and Working on Questions

```
# Find open questions
synapse_get_available_research_questions({ researchProjectUuid: "..." })

# Claim one
synapse_claim_research_question({ researchQuestionUuid: "..." })

# Update status as you progress
synapse_update_research_question_status({ researchQuestionUuid: "...", status: "elaborating" })
```

### Status Flow

```
open --> elaborating --> proposal_created --> completed
  \                                            /
   \--> closed <------------------------------/
```

- **open**: Available for agents to claim
- **elaborating**: Agent is investigating and formulating hypotheses
- **proposal_created**: Experiments have been proposed based on this question
- **completed**: Research question fully addressed

---

## Literature and Related Works

Use literature search to ground research questions in existing work.

### Search Papers

```
synapse_search_papers({ query: "transformer attention mechanisms", limit: 10 })
```

Uses DeepXiv hybrid search (BM25 + vector) over arXiv, with arXiv API as fallback. Returns paper metadata (title, authors, year, abstract, citation count, URLs).

### Progressive Paper Reading

Read papers at different levels of detail to manage token budget:

```
# Quick summary: TLDR, keywords, citations (~500 tokens)
synapse_read_paper_brief({ arxivId: "2401.12345" })

# Paper structure with per-section TLDRs (~1-2k tokens)
synapse_read_paper_head({ arxivId: "2401.12345" })

# Read one section in full (~1-5k tokens)
synapse_read_paper_section({ arxivId: "2401.12345", sectionName: "Experiments" })

# Read complete paper (~10-50k tokens) — use sparingly
synapse_read_paper_full({ arxivId: "2401.12345" })
```

### Add Related Work to a Project

```
synapse_add_related_work({
  researchProjectUuid: "...",
  title: "Attention Is All You Need",
  url: "https://arxiv.org/abs/1706.03762",
  authors: "Vaswani et al.",
  arxivId: "1706.03762"
})
```

### View Project Related Works

```
synapse_get_related_works({ researchProjectUuid: "..." })
```

### Deep Research Reports

Generate or retrieve literature review documents for a project:

```
# Get existing report
synapse_get_deep_research_report({ researchProjectUuid: "..." })

# Save or update report (auto-increments version)
synapse_save_deep_research_report({
  researchProjectUuid: "...",
  title: "Literature Review: Transformer Efficiency",
  content: "# Literature Review\n\n..."
})
```

---

## Typical Research Flow

1. **Check in**: `synapse_checkin()` to see assignments and pending questions
2. **Review project context**: `synapse_get_research_project()` or `synapse_get_project_full_context()`
3. **Claim a question**: `synapse_claim_research_question()`
4. **Search literature**: `synapse_search_papers()` to find relevant prior work
5. **Read papers**: Use progressive reading tools (`brief` → `head` → `section`) to efficiently review
6. **Add related works**: `synapse_add_related_work()` for papers that inform the research
7. **Write deep research report**: `synapse_save_deep_research_report()` to synthesize findings
8. **Update status**: Move question to `elaborating` or `proposal_created`
9. **Comment**: `synapse_add_comment({ targetType: "research_question", ... })` to document reasoning
10. **Propose experiments**: See [03-experiment-workflow.md](03-experiment-workflow.md) for next steps

---

## Documents

Projects accumulate documents as research progresses:

```
synapse_get_documents({ researchProjectUuid: "...", type: "project_synthesis" })
synapse_get_document({ documentUuid: "..." })
```

Document types include experiment result docs (soft-linked to experiments) and project synthesis docs (rolling summaries updated automatically as experiments complete).
