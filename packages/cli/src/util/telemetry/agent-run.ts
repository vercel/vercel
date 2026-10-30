import type Client from '../client';
import type { TelemetryEventStore } from '.';
import type { RootTelemetryClient } from './root';
import { isHelpInvocation, trackAgentCommandOutcome } from './agent-error';
import {
  recordCliErrorFromOutput,
  takeCliError,
  UNCLASSIFIED_ERROR_CODE,
} from './cli-error';

export interface RunTelemetryOptions {
  isAgent: boolean;
  telemetry: RootTelemetryClient;
  store: TelemetryEventStore;
  /** The shared `Client`, which does not exist yet for early exits. */
  getClient: () => Client | undefined;
  /** Team and user from the config files, for when there is no `Client` yet. */
  getConfigIdentity: () => { teamId?: string; userId?: string };
  /** Must be synchronous, since it runs in the exit listener. */
  getProjectId: () => string | undefined;
}

export interface RunTelemetry {
  /** Adds the end-of-run events: the error behind a failed agent run and the outcome. */
  trackRunEnd: (exitCode: number) => void;
  /** Call right before the normal path calls `store.save()`. */
  markSaveStarted: () => void;
  readonly saveStarted: boolean;
  /**
   * For a `process.on('exit')` listener. Saves the run when `process.exit()`
   * skipped the normal save, including an exit during its lookups. Exit
   * listeners must be synchronous, so the user lookup is skipped.
   */
  flushOnExit: (exitCode: number) => void;
}

export function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function createRunTelemetry({
  isAgent,
  telemetry,
  store,
  getClient,
  getConfigIdentity,
  getProjectId,
}: RunTelemetryOptions): RunTelemetry {
  let runEndTracked = false;
  let saveStarted = false;

  // Commands mostly print an error and return a non-zero exit code, so a run
  // with no recorded error still gets a code and shows up as a failure
  const trackFailedRunError = (exitCode: number, client?: Client) => {
    // Taken before the checks because `reportOnSuccess` decides whether a run
    // that exited `0` still sends its error
    const details = takeCliError();
    if (
      !isAgent ||
      (exitCode === 0 && !details?.reportOnSuccess) ||
      isHelpInvocation(client?.argv ?? process.argv)
    ) {
      return;
    }
    telemetry.trackErrorStatus(details?.status);
    telemetry.trackErrorCode(details?.code ?? UNCLASSIFIED_ERROR_CODE);
    telemetry.trackErrorSlug(details?.slug);
    telemetry.trackErrorAction(details?.action);
    telemetry.trackErrorServerMessage(details?.serverMessage);
  };

  const trackRunEnd = (exitCode: number) => {
    if (runEndTracked) return;
    runEndTracked = true;
    const client = getClient();
    trackFailedRunError(exitCode, client);
    if (client) trackAgentCommandOutcome(client, exitCode);
  };

  return {
    trackRunEnd,
    markSaveStarted: () => {
      saveStarted = true;
    },
    get saveStarted() {
      return saveStarted;
    },
    flushOnExit: exitCode => {
      if (saveStarted) return;
      saveStarted = true;
      // Telemetry must never change the exit code or print at exit. Each step
      // is best-effort, so a failed lookup loses one field, not the whole save.
      attempt(() => trackRunEnd(exitCode));
      const client = getClient();
      const identity = attempt(getConfigIdentity);
      attempt(() =>
        store.updateTeamId(client?.config.currentTeam ?? identity?.teamId)
      );
      attempt(() =>
        store.updateUserId(client?.authConfig.userId ?? identity?.userId)
      );
      // `getVercelDirectory()` throws when both `.vercel` and `.now` exist
      const projectId = attempt(getProjectId);
      if (projectId) store.updateProjectId(projectId);
      attempt(() => telemetry.trackProjectId(store.currentProjectId));
      attempt(() => store.save({ detach: true }).catch(() => {}));
    },
  };
}

/**
 * Records agent JSON error payloads written to `stream`, which many commands
 * write directly instead of through `outputAgentError()`. Returns a function
 * that removes the hook.
 */
export function captureStdoutErrors(stream: NodeJS.WriteStream): () => void {
  const write = stream.write;
  stream.write = function (
    this: NodeJS.WriteStream,
    chunk: unknown,
    ...rest: unknown[]
  ) {
    recordCliErrorFromOutput(chunk);
    return Reflect.apply(write, this, [chunk, ...rest]);
  } as typeof stream.write;
  return () => {
    stream.write = write;
  };
}
