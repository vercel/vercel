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

  const { path, isFullUrl, deploymentFlag, protectionBypassFlag, toolFlags } =
    setup;

  // For full URLs without explicit protection bypass, try fast path first
  // If we detect a protection error (401/403), retry with slow path to get bypass token
  if (isFullUrl && !protectionBypassFlag) {
    // Step 1: Try fast path (no protection bypass, no project linking)
    const fastResult = await getDeploymentUrlAndToken(
      client,
      'httpstat',
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

    // Step 2: Make a test request using curl to check for protection errors
    // httpstat doesn't have a way to capture status code without showing output,
    // so we use curl for the test, then run httpstat if it succeeds
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
      // Fast path succeeded - execute the actual request with httpstat
      const httpstatFlags = [fullUrl, ...toolFlags];
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
            output.error(
              'httpstat command not found. Please install httpstat.'
            );
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

    // Step 4: Protection error detected - fall back to slow path to get bypass token
    output.debug('Deployment protection detected, fetching bypass token...');
  }

  // Slow path: get deployment URL and protection token (may require project linking)
  const result = await getDeploymentUrlAndToken(
    client,
    'httpstat',
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
