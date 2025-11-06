/* eslint-disable no-console */
import { spawn } from 'child_process';
import type Client from '../../util/client';
import { curlCommand } from './command';
import output from '../../output-manager';
import { requoteArgs } from './utils';
import { CurlTelemetryClient } from '../../util/telemetry/commands/curl';
import { getDeploymentUrlAndToken, setupCurlLikeCommand } from './shared';

export default async function curl(client: Client): Promise<number> {
  const telemetryClient = new CurlTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const setup = setupCurlLikeCommand(client, curlCommand, telemetryClient);

  if (typeof setup === 'number') {
    return setup;
  }

  const { path, deploymentFlag, protectionBypassFlag, toolFlags } = setup;

  const result = await getDeploymentUrlAndToken(client, 'curl', path, {
    deploymentFlag,
    protectionBypassFlag,
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
