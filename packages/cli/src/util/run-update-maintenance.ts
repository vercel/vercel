import output from '../output-manager';

/** Keep optional post-command updates from failing the completed command. */
export async function runUpdateMaintenance(
  exitCode: number | undefined,
  update: () => Promise<number | undefined>
): Promise<number | undefined> {
  try {
    return await update();
  } catch (error) {
    output.stopSpinner();
    output.debug(
      `Post-command update failed; preserving exit code ${exitCode ?? 0}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return exitCode;
  }
}
