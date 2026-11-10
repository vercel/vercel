import { client } from '../mocks/client';
import { RootTelemetryClient } from '../../src/util/telemetry/root';
import {
  captureStdoutErrors,
  createRunTelemetry,
} from '../../src/util/telemetry/agent-run';
import { takeCliError } from '../../src/util/telemetry/cli-error';

/**
 * Runs a command as a detected agent through the CLI's real end-of-run
 * telemetry, including the stdout capture of agent JSON payloads.
 */
export async function runAsAgent(command: () => Promise<number>) {
  takeCliError();
  client.isAgent = true;
  const restore = captureStdoutErrors(
    client.stdout as unknown as NodeJS.WriteStream
  );
  try {
    const exitCode = await command();
    const store = client.telemetryEventStore;
    createRunTelemetry({
      isAgent: true,
      telemetry: new RootTelemetryClient({ opts: { store } }),
      store,
      getClient: () => client,
      getConfigIdentity: () => ({}),
      getProjectId: () => undefined,
    }).trackRunEnd(exitCode);
    return exitCode;
  } finally {
    restore();
  }
}
