export function buildTurnPrompt(d: {
  experimentUuid: string;
  researchProjectUuid?: string;
  title?: string;
  message?: string;
  isFirstTurn: boolean;
}): string {
  if (d.isFirstTurn) {
    const titlePart = d.title ? ` ("${d.title}")` : "";
    const projPart = d.researchProjectUuid ? ` in research project ${d.researchProjectUuid}` : "";
    return [
      `You have been assigned Synapse experiment ${d.experimentUuid}${titlePart}${projPart}.`,
      `Use the Synapse MCP tools to inspect context before acting: call synapse_get_experiment for this experiment and synapse_get_project_full_context for the project.`,
      `Then plan and execute the experiment. Check compute availability with synapse_list_compute_nodes before any run; reserve GPUs inside the project's pool if one is set.`,
      `Report progress with synapse_report_experiment_progress and submit results with synapse_submit_experiment_results when done.`,
      d.message ? `Assignment note: ${d.message}` : "",
    ].filter(Boolean).join("\n");
  }
  return [
    `New instruction on Synapse experiment ${d.experimentUuid}.`,
    d.message ? `Instruction: ${d.message}` : `Continue the work on this experiment.`,
    `Re-check current state with synapse_get_experiment before acting.`,
  ].join("\n");
}
