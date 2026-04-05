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

Searches Semantic Scholar and returns paper metadata (title, authors, year, abstract, citation count, URLs).

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

---

## Typical Research Flow

1. **Check in**: `synapse_checkin()` to see assignments and pending questions
2. **Review project context**: `synapse_get_research_project()` or `synapse_get_project_full_context()`
3. **Claim a question**: `synapse_claim_research_question()`
4. **Search literature**: `synapse_search_papers()` to find relevant prior work
5. **Add related works**: `synapse_add_related_work()` for papers that inform the research
6. **Update status**: Move question to `elaborating` or `proposal_created`
7. **Comment**: `synapse_add_comment({ targetType: "research_question", ... })` to document reasoning
8. **Propose experiments**: See [03-experiment-workflow.md](03-experiment-workflow.md) for next steps

---

## Documents

Projects accumulate documents as research progresses:

```
synapse_get_documents({ researchProjectUuid: "...", type: "project_synthesis" })
synapse_get_document({ documentUuid: "..." })
```

Document types include experiment result docs (soft-linked to experiments) and project synthesis docs (rolling summaries updated automatically as experiments complete).
