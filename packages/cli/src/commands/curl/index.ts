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
  // If we detect a protection error (401/403), retry with slow path to get bypass token
  if (isFullUrl && !protectionBypassFlag) {
    // Step 1: Try fast path (no protection bypass, no project linking)
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

    // Step 2: Make a test request to check for protection errors
    // Use --write-out to capture HTTP status code without showing output
    const testCurlFlags = [
      '--url',
      fullUrl,
      '--write-out',
      '%{http_code}',
      '--silent',
      '--output',
      '/dev/null',
      ...toolFlags,
    ];

    const httpStatusCode = await new Promise<string | null>(resolve => {
      const testProcess = spawn('curl', testCurlFlags, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let statusCode = '';

      testProcess.stdout?.on('data', (data: Buffer) => {
        statusCode += data.toString();
      });

      testProcess.on('error', () => {
        resolve(null);
      });

      testProcess.on('close', () => {
        resolve(statusCode.trim());
      });
    });

    // Step 3: If we got 401 or 403, it's likely a protection error - retry with slow path
    const isProtectionError =
      httpStatusCode === '401' || httpStatusCode === '403';

    if (!isProtectionError) {
      // Fast path succeeded - execute the actual request with output visible
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

    // Step 4: Protection error detected - fall back to slow path to get bypass token
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
