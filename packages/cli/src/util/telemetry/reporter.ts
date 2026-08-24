import type { RootTelemetryClient } from './root';

// Set once in `main()` so shared error paths (e.g. `printError`) can emit
// telemetry without threading a client through every call site.
let reporter: RootTelemetryClient | undefined;

export function setTelemetryReporter(
  client: RootTelemetryClient | undefined
): void {
  reporter = client;
}

export function getTelemetryReporter(): RootTelemetryClient | undefined {
  return reporter;
}

// `getSubcommand` cannot tell an unknown subcommand from a positional
// argument to an implicit default action (e.g. `vercel alias <src> <tgt>`),
// so it parks the candidate here and `getInvalidSubcommand` — which only
// runs when a dispatcher actually rejects — consumes and reports it.
let pendingSubcommandToken: string | undefined;

export function setPendingSubcommandNotFound(token: string | undefined): void {
  pendingSubcommandToken = token;
}

export function consumePendingSubcommandNotFound(): string | undefined {
  const token = pendingSubcommandToken;
  pendingSubcommandToken = undefined;
  return token;
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
