import type { RootTelemetryClient } from './root';

// Set once in `main()` so shared error paths (e.g. `printError`) can emit
// telemetry without threading a client through every call site.
let reporter: RootTelemetryClient | undefined;

export function setTelemetryReporter(client: RootTelemetryClient): void {
  reporter = client;
}

export function getTelemetryReporter(): RootTelemetryClient | undefined {
  return reporter;
}

/**
 * Flush-then-exit for paths that must hard-exit outside `main()`'s normal
 * return flow. The detached flush spawn happens synchronously inside
 * `save()`, so it survives the immediate `process.exit`.
 */
export function exitWithTelemetry(code: number): never {
  if (reporter) {
    reporter.trackExitCode(code);
    void reporter.store.save();
  }
  process.exit(code);
}
