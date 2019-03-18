import Client from './client';
import getScope from './get-scope.ts';
import getArgs from './get-args';

export default async (sentry, error, apiUrl, configFiles) => {
  // Do not report errors in development
  if (!process.pkg) {
    return;
  }

  let user = null;
  let team = null;

  try {
    const { token } = configFiles.readAuthConfigFile();
    const { currentTeam } = configFiles.readConfigFile();
    const client = new Client({ apiUrl, token, currentTeam, debug: false });
    ({ user, team } = await getScope(client));
  } catch (err) {
    // We can safely ignore this, as the error
    // reporting works even without this metadata attached.
  }

  if (user || team) {
    sentry.withScope(scope => {
      if (user) {
        const spec = {
          email: user.email,
          id: user.uid
        };

        if (user.username) {
          spec.username = user.username;
        }

        if (user.name) {
          spec.name = user.name;
        }

        scope.setUser(spec);
      }

      if (team) {
        scope.setTag('currentTeam', team.id);
      }

      // Report process.argv without sensitive data
      let args
      try {
        args = getArgs(process.argv.slice(2), {});
      } catch (_) {}

      if (args) {
        const flags = ['--env', '--build-env', '--token']
        for (const flag of flags) {
          if (args[flag]) args[flag] = 'REDACTED';
        }
        if (args._.length >= 4 && args._[0].startsWith('secret') && args._[1] === 'add') {
          args._[3] = 'REDACTED';
        }
        scope.setExtra('args', args);
      }

      sentry.captureException(error);
    });
  } else {
    sentry.captureException(error);
  }

  const client = sentry.getCurrentHub().getClient();

  if (client) {
    await client.close();
  }
};
