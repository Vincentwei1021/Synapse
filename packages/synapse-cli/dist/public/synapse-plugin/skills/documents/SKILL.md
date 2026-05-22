---
name: documents
description: Write and update Synapse documents, reports, synthesis, and Markdown figures. Use when embedding charts, plots, images, or report visuals in Synapse documents.
license: AGPL-3.0
metadata:
  author: Vincentwei1021
  version: "0.8.1"
  category: research
  mcp_server: synapse
---

# Documents Skill

Use this skill when writing Synapse documents that need durable Markdown, tables, charts, plots, or embedded images. This includes experiment reports, project synthesis, deep research reports, and manually updated project documents.

## Rendering Reality

Synapse documents render Markdown. The document page supports:

- Standard Markdown images: `![caption](/api/documents/:documentUuid/images/:filename)`
- Tables via GitHub-flavored Markdown
- Simple `chart` code blocks rendered by the UI as bar or line charts

For simple numeric comparisons, prefer a `chart` block:

````
```chart
label,accuracy,loss
baseline,0.71,0.42
variant,0.78,0.36
```
````

For a line chart:

````
```chart:line
step,loss
1,0.92
2,0.73
3,0.61
```
````

Use generated image files for plots that need error bars, multi-panel layouts, confusion matrices, heatmaps, ROC/PR curves, qualitative examples, or anything the simple chart block cannot express cleanly.

## Image Upload Flow

Never embed local file paths, `data:` URLs, or third-party image hosts. Images must be uploaded to Synapse with `synapse_upload_document_image`, then referenced with the returned `url`.

For experiment reports, you may upload figures before the report document has been saved:

```text
synapse_upload_document_image({
  experimentUuid: "<experimentUuid>",
  filename: "metric-comparison.png",
  mimeType: "image/png",
  base64Content: "<base64 image bytes>"
})
```

The tool creates or reuses the dedicated experiment result document and returns:

```json
{
  "documentUuid": "...",
  "url": "/api/documents/.../images/..."
}
```

Embed the returned URL in the report Markdown, then save the report:

```markdown
![Metric comparison](/api/documents/.../images/...)
```

```text
synapse_save_experiment_report({
  experimentUuid: "<experimentUuid>",
  title: "Experiment Report: ...",
  content: "# Objective\n\n..."
})
```

For existing non-experiment documents, use `documentUuid` instead:

```text
synapse_upload_document_image({
  documentUuid: "<documentUuid>",
  filename: "synthesis-trend.png",
  mimeType: "image/png",
  base64Content: "<base64 image bytes>"
})
```

If a synthesis or deep research document does not exist yet, save a first version with the relevant save tool, read the returned document UUID, upload images with `documentUuid`, then save the final Markdown with the returned image URLs.

## Plotting Guidance

Use Python plus a plotting library when figures help interpretation. Keep plots readable in a document page:

- Use PNG for most plots; SVG is fine for diagrams and simple vector charts.
- Give every figure a useful Markdown alt/caption.
- Prefer 1-3 high-signal figures over many small plots.
- Match the report language to the project description.
- Mention the metric source and split/eval set near the figure.

## Report Checklist

Before saving a document with figures:

1. Confirm every image URL starts with `/api/documents/`.
2. Confirm no local paths, temporary hosts, or base64 data URLs remain.
3. Use `chart` blocks for small tabular numeric comparisons when that is clearer than an uploaded image.
4. Save through the task-specific document tool, such as `synapse_save_experiment_report`, `synapse_save_project_synthesis`, or `synapse_save_deep_research_report`.
