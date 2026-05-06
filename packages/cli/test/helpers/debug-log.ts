/**
 * Log a message that is only shown in CI when debug logging is enabled
 * (i.e. when the job is re-run with "Enable debug logging" in GitHub Actions,
 * which sets RUNNER_DEBUG=1). Outside CI the message always prints.
 *
 * Use this instead of console.log for cleanup/housekeeping messages that
 * clutter CI output but aren't useful unless something has gone wrong.
 */
export function debugLog(message: string): void {
  if (process.env.CI && process.env.RUNNER_DEBUG !== '1') {
    return;
  }
  console.log(message);
}
