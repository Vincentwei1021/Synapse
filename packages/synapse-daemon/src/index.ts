// Entry point for `synapse daemon`. Full wiring lands in a later task.
export async function runDaemon(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("synapse daemon — wakes local Claude Code on experiment assignment");
    return;
  }
  console.log("synapse daemon: not yet wired up");
}
