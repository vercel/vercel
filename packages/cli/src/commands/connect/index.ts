import { randomBytes, createHash } from 'node:crypto';
import chalk from 'chalk';
import * as open from 'open';
import { help } from '../help';
import { connectCommand } from './command';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { ConnectTelemetryClient } from '../../util/telemetry/commands/connect';

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const STS_URL = 'https://sts-prep.vercel.app';

interface RegistrationStatus {
  status: 'pending' | 'completed' | 'abandoned' | 'not_found';
  tokenDefinitionId?: string;
  error?: string;
}

function generateRandomCode(): string {
  return randomBytes(32)
    .toString('base64url');
}

function hashCode(code: string): string {
  return createHash('sha256')
    .update(code)
    .digest('base64url');
}

function buildRegistrationUrl(
  stsUrl: string,
  codeHash: string,
  params: {
    provider?: string;
    mode?: string;
    appName?: string;
  }
): string {
  const url = new URL('/setup/register', stsUrl);
  url.searchParams.set('code', codeHash);

  if (params.provider) {
    url.searchParams.set('provider', params.provider);
  }
  if (params.mode) {
    url.searchParams.set('mode', params.mode);
  }
  if (params.appName) {
    url.searchParams.set('appName', params.appName);
  }

  return url.toString();
}

async function pollRegistrationStatus(
  stsUrl: string,
  code: string,
  timeoutMs: number
): Promise<RegistrationStatus> {
  const statusUrl = new URL('/setup/register/status', stsUrl);
  statusUrl.searchParams.set('code', code);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(statusUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 404) {
          await sleep(POLL_INTERVAL_MS);
          continue;
        }
        const errorText = await response.text();
        throw new Error(`Failed to check registration status: ${errorText}`);
      }

      const status = (await response.json()) as RegistrationStatus;

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'abandoned') {
        return status;
      }

      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      if (Date.now() - startTime >= timeoutMs) {
        throw error;
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  throw new Error('Registration timed out');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function connect(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(connectCommand.options);

  const telemetry = new ConnectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('connect');
    output.print(help(connectCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const provider = parsedArgs.args[0];
  if (!provider) {
    output.error(
      'Missing required argument: provider. Usage: vc connect <provider>'
    );
    return 1;
  }

  const mode = (parsedArgs.flags['--mode'] as string) || 'bot';
  const appName = parsedArgs.flags['--app-name'] as string | undefined;
  const noOpen = parsedArgs.flags['--no-open'] as boolean | undefined;
  const timeout = parsedArgs.flags['--timeout'] as number | undefined;
  const timeoutMs = timeout ? timeout * 1000 : DEFAULT_TIMEOUT_MS;

  const stsUrl = process.env.STS_URL || STS_URL;

  try {
    // Generate PKCE-like code
    const code = generateRandomCode();
    const codeHash = hashCode(code);

    // Build registration URL
    const registrationUrl = buildRegistrationUrl(stsUrl, codeHash, {
      provider,
      mode,
      appName,
    });

    output.log('');
    output.log(
      `  To connect ${chalk.bold(provider)}, visit the following URL:`
    );
    output.log('');
    output.log(`  ${chalk.cyan(registrationUrl)}`);
    output.log('');

    // Open browser unless --no-open
    if (!noOpen) {
      output.log('  Opening browser...');
      try {
        await open.default(registrationUrl);
      } catch {
        output.log(
          '  Could not open browser automatically. Please visit the URL above.'
        );
      }
    }

    output.spinner('Waiting for authentication...');

    // Poll for completion
    const result = await pollRegistrationStatus(stsUrl, code, timeoutMs);

    output.stopSpinner();

    if (result.status === 'completed') {
      output.log('');
      output.success(
        `${chalk.bold(provider)} connected! Token ID: ${chalk.cyan(result.tokenDefinitionId)}`
      );
      output.log('');
      output.log(
        `  Use ${chalk.cyan(`vc connect`)} to manage your connections.`
      );
      output.log(
        `  The token can be retrieved via the STS SDK or CLI.`
      );
      return 0;
    }

    if (result.status === 'abandoned') {
      output.error(
        `Connection abandoned: ${result.error || 'Registration was cancelled.'}`
      );
      return 1;
    }

    output.error('Unexpected registration status.');
    return 1;
  } catch (error) {
    output.stopSpinner();
    if (error instanceof Error) {
      output.error(error.message);
    } else {
      output.error(String(error));
    }
    return 1;
  }
}
