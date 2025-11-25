/* eslint-disable no-console */
import { spawn } from 'child_process';
import type Client from '../../util/client';
import { httpstatCommand } from './command';
import output from '../../output-manager';
import { requoteArgs } from '../curl/utils';
import { HttpstatTelemetryClient } from '../../util/telemetry/commands/httpstat';
import { getDeploymentUrlAndToken, setupCurlLikeCommand } from '../curl/shared';

export default async function httpstat(client: Client): Promise<number> {
  const telemetryClient = new HttpstatTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const setup = setupCurlLikeCommand(client, httpstatCommand, telemetryClient);

  if (typeof setup === 'number') {
    return setup;
  }

  const { path, deploymentFlag, protectionBypassFlag, toolFlags } = setup;

  const result = await getDeploymentUrlAndToken(client, 'httpstat', path, {
    deploymentFlag,
    protectionBypassFlag,
  });

  if (typeof result === 'number') {
    return result;
  }

  const { fullUrl, deploymentProtectionToken } = result;

  const httpstatFlags = [...toolFlags];

  if (deploymentProtectionToken) {
    httpstatFlags.unshift(
      '-H',
      `x-vercel-protection-bypass: ${deploymentProtectionToken}`
    );
  }

  httpstatFlags.unshift(fullUrl);

  output.debug(
    `Executing: httpstat ${httpstatFlags.map(requoteArgs).join(' ')}`
  );

  return new Promise<number>(resolve => {
    const httpstatProcess = spawn('httpstat', httpstatFlags, {
      stdio: 'inherit',
      shell: false,
    });

    httpstatProcess.on('error', (err: Error) => {
      if ('code' in err && err.code === 'ENOENT') {
        output.error('httpstat command not found. Please install httpstat.');
        output.log('');
        output.log('Installation instructions:');
        output.log('  macOS: brew install httpstat');
        output.log('  pip: pip install httpstat');
        output.log('  npm: npm install -g httpstat');
        output.log('');
        output.log(
          'Or visit: https://github.com/reorx/httpstat for more details'
        );
        resolve(1);
      } else {
        output.error(`Failed to execute httpstat: ${err.message}`);
        resolve(1);
      }
    });

    httpstatProcess.on('close', (code: number | null) => {
      resolve(code ?? 1);
    });
  });
}
