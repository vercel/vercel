import type Client from './client';
import { getSentry } from './get-sentry';
import reportError from './report-error';
import output from '../output-manager';
import { cliErrorFromUnknown, recordCliError } from './telemetry/cli-error';

const fatalErrorHandlerSymbol = Symbol.for('vercel.cli.fatal-error-handler');

export async function exitWithUnexpectedError(error: unknown): Promise<never> {
  const handler = (globalThis as unknown as Record<symbol, unknown>)[
    fatalErrorHandlerSymbol
  ];
  if (typeof handler === 'function') {
    try {
      await (handler as (error: unknown) => Promise<void>)(error);
    } catch {}
  }
  process.exit(1);
}

export async function handleUnexpectedError(
  client: Client | undefined,
  err: Error
): Promise<boolean> {
  const { message } = err;

  // We do not want to render errors about Sentry not being reachable
  if (message.includes('sentry') && message.includes('ENOTFOUND')) {
    output.debug(`Sentry is not reachable: ${err}`);
    return false;
  }

  output.error(`An unexpected error occurred!\n${err.stack}`);
  await reportError(await getSentry(), client as Client, err);
  return true;
}

// Sentry is lazily initialized only when an error actually occurs.
export function registerUnexpectedErrorHandlers(
  getClient: () => Client | undefined
): void {
  process.on('unhandledRejection', async (err: any) => {
    // This handler stops Node from reporting the rejection as an uncaught
    // exception. An error the command already reported wins, since a stray
    // background rejection (e.g. the update check) isn't what the agent hit.
    recordCliError(cliErrorFromUnknown(err));
    if (err) {
      if (err instanceof Error) {
        await handleUnexpectedError(getClient(), err);
      } else {
        output.error(`An unexpected rejection occurred\n  ${err}`);
        await reportError(await getSentry(), getClient() as Client, err);
      }
    } else {
      output.error('An unexpected empty rejection occurred');
    }

    await exitWithUnexpectedError(err);
  });
  process.on('uncaughtException', async error => {
    if (await handleUnexpectedError(getClient(), error)) {
      await exitWithUnexpectedError(error);
    }
  });
}
