import { spawn } from 'node:child_process';
import { cloneEnv } from '@vercel/build-utils';
import output from '../output-manager';
import { isNativeBinaryInstall } from '../util/native-install';
import {
  getOrCreatePersistedCliDevice,
  getOrCreatePersistedCliSession,
  touchPersistedCliSession,
  type PersistedCliSession,
} from '../util/telemetry/session';
import {
  readVercelPluginActiveSessionMarker,
  type VercelPluginActiveSessionMarker,
} from '../util/telemetry/vercel-plugin';

/** Payload handed to the `telemetry flush` subprocess. */
export type TelemetryFlushPayload = {
  headers: Record<string, string>;
  body: unknown[];
};

/** Telemetry host storage (device/session identity) and event delivery. */
export type TelemetryGateway = {
  loadDeviceId(): string;
  loadSession(): PersistedCliSession;
  touchSession(input: { session: PersistedCliSession }): PersistedCliSession;
  readPluginSessionMarker(): VercelPluginActiveSessionMarker | null;
  send(input: {
    payload: TelemetryFlushPayload;
    debug: boolean;
  }): Promise<void>;
};

export function liveTelemetryGateway({
  deviceFilePath,
  sessionFilePath,
}: {
  deviceFilePath: string;
  sessionFilePath: string;
}): TelemetryGateway {
  return {
    loadDeviceId() {
      return getOrCreatePersistedCliDevice({ filePath: deviceFilePath }).id;
    },
    loadSession() {
      return getOrCreatePersistedCliSession({ filePath: sessionFilePath });
    },
    touchSession({ session }) {
      return touchPersistedCliSession({ filePath: sessionFilePath }, session);
    },
    readPluginSessionMarker() {
      return readVercelPluginActiveSessionMarker();
    },
    send({ payload, debug }) {
      return sendTelemetryToSubprocess(payload, debug);
    },
  };
}

/**
 * Send the telemetry events to a subprocess, this invokes the `telemetry flush` command
 * and passes a stringified payload to the subprocess, there's a risk that if the event payload
 * increases in size, it may exceed the maximum buffer size for the subprocess, in which case the
 * child process will error and not send anything.
 * FIXME: handle max buffer size
 */
export async function sendTelemetryToSubprocess(
  payload: TelemetryFlushPayload,
  outputDebugEnabled: boolean
): Promise<void> {
  const flushArgs = ['telemetry', 'flush', JSON.stringify(payload)];
  let nodeBinaryPath: string;
  let script: string[];
  if (isNativeBinaryInstall()) {
    // In the standalone binary, `process.argv[1]` is a virtual snapshot path
    // (e.g. `/snapshot/cli/pkg.js`) and the binary always runs its embedded
    // entrypoint, so a script path argument would be parsed as a deploy path.
    nodeBinaryPath = process.execPath;
    script = flushArgs;
  } else {
    const args = [process.execPath, process.argv[0], process.argv[1]];
    if (args[0] === args[1]) {
      args.shift();
    }
    nodeBinaryPath = args[0];
    script = [...args.slice(1), ...flushArgs];
  }
  // We need to disable telemetry in the subprocess, otherwise we'll end up in an infinite loop
  const env = cloneEnv(process.env, {
    VERCEL_TELEMETRY_DISABLED: '1',
  });
  // When debugging, we want to know about the response from the server, so we can't exit early
  if (outputDebugEnabled) {
    return new Promise<void>(resolve => {
      const childProcess = spawn(nodeBinaryPath, script, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      childProcess.stderr.on('data', data => output.debug(data.toString()));
      childProcess.stdout.on('data', data => output.debug(data.toString()));
      childProcess.on('error', d => {
        output.debug(d);
      });

      const timeout = setTimeout(() => {
        // If the subprocess doesn't respond within 2 seconds, kill it so the process can exit
        output.debug('Telemetry subprocess killed due to timeout');
        childProcess.kill();
      }, 2000);

      childProcess.on('exit', code => {
        output.debug(`Telemetry subprocess exited with code ${code}`);
        childProcess.unref();
        timeout.unref();
        // An error in the subprocess should not trigger a bad exit code, so don't reject under any circumstances
        resolve();
      });
    });
  } else {
    const childProcess = spawn(nodeBinaryPath, script, {
      stdio: 'ignore',
      env,
      windowsHide: true,
      detached: true,
    });

    childProcess.unref();
  }
}
