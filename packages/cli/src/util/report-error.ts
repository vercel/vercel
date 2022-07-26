import Client from './client';
import getScope from './get-scope';
import getArgs from './get-args';
import { isError } from './is-error';
import type { Team, User } from '../types';

export default async function reportError(
  sentry: typeof import('@sentry/node'),
  client: Client,
  error: unknown
) {
  if (ignoreError(error)) {
    return;
  }
  let user: User | undefined;
  let team: Team | null | undefined;
  let scopeError: Error | undefined;

  try {
    ({ user, team } = await getScope(client));
  } catch (err: unknown) {
    // We can safely ignore this, as the error
    // reporting works even without this metadata attached.
    if (isError(err)) {
      scopeError = err;
    }
  }

  sentry.withScope(scope => {
    if (user) {
      const spec = {
        email: user.email,
        id: user.id,
        username: user.username,
        name: user.name,
      };

      scope.setUser(spec);
    }

    if (team) {
      scope.setTag('currentTeam', team.id);
    }

    if (scopeError) {
      scope.setExtra('scopeError', {
        name: scopeError.name,
        message: scopeError.message,
        stack: scopeError.stack,
      });
    }

    // Report `process.argv` without sensitive data
    let args: any | undefined;
    let argsError: Error | undefined;
    try {
      args = getArgs(process.argv.slice(2), {});
    } catch (err: unknown) {
      if (isError(err)) {
        argsError = err;
      }
    }

    if (args) {
      const flags = ['--env', '--build-env', '--token'];
      for (const flag of flags) {
        if (args[flag]) args[flag] = 'REDACTED';
      }
      if (
        args._.length >= 4 &&
        args._[0].startsWith('secret') &&
        args._[1] === 'add'
      ) {
        args._[3] = 'REDACTED';
      }
      scope.setExtra('args', args);
    } else {
      let msg = 'Unable to parse args';
      if (argsError) {
        msg += `: ${argsError}`;
      }
      scope.setExtra('args', msg);
    }

    // Report information about the version of `node` being used
    scope.setExtra('node', {
      execPath: process.execPath,
      version: process.version,
      platform: process.platform,
    });

    sentry.captureException(error);
  });

  const sentryClient = sentry.getCurrentHub().getClient();
  if (sentryClient) {
    await sentryClient.close();
  }
}

function ignoreError(error: unknown) {
  return isError(error) && error.message.includes('uv_cwd');
}
