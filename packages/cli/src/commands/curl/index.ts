import { spawn } from 'child_process';
import type Client from '../../util/client';
import { curlCommand } from './command';
import output from '../../output-manager';
import { requoteArgs } from './utils';
import { CurlTelemetryClient } from '../../util/telemetry/commands/curl';
import {
  getDeploymentUrlAndToken,
  getFullUrlAndToken,
  setupCurlLikeCommand,
} from './shared';
import { trace } from './trace';

export default async function curl(client: Client): Promise<number> {
  return runCurl(client, {});
}

/**
 * Shared execution for `vercel curl` and its aliases (e.g. `vercel traces
 * create`). Handles argument setup, URL/token resolution, and either spawning
 * curl directly or running the `--trace` capture flow.
 *
 * `forceTrace` makes the trace flow run regardless of the `--trace` flag, which
 * is how `traces create` aliases `curl --trace`. `args` overrides the parsed
 * argument list (post `argv.slice(2)`); callers like `traces create` pass the
 * args with their own subcommand prefix already stripped.
 */
export async function runCurl(
  client: Client,
  { forceTrace = false, args }: { forceTrace?: boolean; args?: string[] }
): Promise<number> {
  const telemetryClient = new CurlTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const setup = setupCurlLikeCommand(client, curlCommand, telemetryClient, {
    allowFullUrl: true,
    args,
  });

  if (typeof setup === 'number') {
    return setup;
  }

  const {
    path,
    isFullUrl,
    deploymentFlag,
    protectionBypassFlag,
    toolFlags,
    json: jsonFlag,
  } = setup;

  const traceFlag = forceTrace || setup.trace;

  const result = isFullUrl
    ? await getFullUrlAndToken(client, path, protectionBypassFlag)
    : await getDeploymentUrlAndToken(client, 'curl', path, {
        deploymentFlag,
        protectionBypassFlag,
        autoConfirm: setup.yes,
      });

  if (typeof result === 'number') {
    return result;
  }

  const { fullUrl, deploymentProtectionToken } = result;

  const curlFlags = [...toolFlags];

  if (deploymentProtectionToken) {
    curlFlags.unshift(
      '--header',
      `x-vercel-protection-bypass: ${deploymentProtectionToken}`
    );
  }

  curlFlags.unshift('--url', fullUrl);

  if (traceFlag) {
    return trace(client, {
      fullUrl,
      link: result.link ?? null,
      curlFlags,
      json: jsonFlag,
      yes: setup.yes,
      telemetry: telemetryClient,
    });
  }

  output.debug(`Executing: curl ${curlFlags.map(requoteArgs).join(' ')}`);

  return new Promise<number>(resolve => {
    const curlProcess = spawn('curl', curlFlags, {
      stdio: 'inherit',
      shell: false,
    });

    curlProcess.on('error', (err: Error) => {
      if ('code' in err && err.code === 'ENOENT') {
        output.error('curl command not found. Please install curl.');
        resolve(1);
      } else {
        output.error(`Failed to execute curl: ${err.message}`);
        resolve(1);
      }
    });

    curlProcess.on('close', (code: number | null) => {
      resolve(code ?? 1);
    });
  });
}
