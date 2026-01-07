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

  const { path, isFullUrl, deploymentFlag, protectionBypassFlag, toolFlags } =
    setup;

  // For full URLs without explicit protection bypass, try fast path first
  // If we get a protection error, retry with slow path
  if (isFullUrl && !protectionBypassFlag) {
    const fastResult = await getDeploymentUrlAndToken(
      client,
      'curl',
      path,
      {
        deploymentFlag,
        protectionBypassFlag,
      },
      isFullUrl
    );

    if (typeof fastResult === 'number') {
      return fastResult;
    }

    const { fullUrl } = fastResult;

    // Try fast path first - capture HTTP status to detect protection errors
    const fastCurlFlags = [
      '--url',
      fullUrl,
      '--write-out',
      '%{http_code}',
      '--silent',
      '--output',
      '/dev/null',
      ...toolFlags,
    ];

    const fastExitCode = await new Promise<number>(resolve => {
      const curlProcess = spawn('curl', fastCurlFlags, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let httpCode = '';

      curlProcess.stdout?.on('data', (data: Buffer) => {
        httpCode += data.toString();
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
        // If we got 401 or 403, it's likely a protection error - retry with slow path
        if (
          code === 0 &&
          (httpCode.trim() === '401' || httpCode.trim() === '403')
        ) {
          resolve(-1); // Special code to indicate retry needed
        } else {
          resolve(code ?? 1);
        }
      });
    });

    // If fast path succeeded or failed for non-protection reasons, use it
    if (fastExitCode !== -1) {
      // Re-run with stdio: 'inherit' for user to see output
      const finalCurlFlags = ['--url', fullUrl, ...toolFlags];
      output.debug(
        `Executing: curl ${finalCurlFlags.map(requoteArgs).join(' ')}`
      );

      return new Promise<number>(resolve => {
        const curlProcess = spawn('curl', finalCurlFlags, {
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

    // Protection error detected - fall back to slow path
    output.debug('Deployment protection detected, fetching bypass token...');
  }

  // Slow path: get deployment URL and protection token (may require project linking)
  const result = await getDeploymentUrlAndToken(
    client,
    'curl',
    path,
    {
      deploymentFlag,
      protectionBypassFlag,
    },
    isFullUrl
  );

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
