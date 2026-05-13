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
  const telemetryClient = new CurlTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const setup = setupCurlLikeCommand(client, curlCommand, telemetryClient, {
    allowFullUrl: true,
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
    trace: traceFlag,
    json: jsonFlag,
  } = setup;

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
