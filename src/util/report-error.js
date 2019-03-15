import Client from './client';
import getScope from './get-scope.ts';

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
      let argv = [...process.argv];
      if (argv[2] === 'secrets' && argv[3] === 'add' && argv[5]) {
        argv[5] = 'REDACTED';
      }
      if (argv[2] === 'teams' && argv[3] === 'invite' && argv[4]) {
        argv[4] = 'REDACTED';
      }
      for (let i = 0; i < argv.length; i++) {
        if ([
          '-e',
          '--env',
          '-b',
          '--build-env',
          '-t',
          '--token',
          '-m',
          '--meta'
        ].includes(argv[i])) {
          argv[i + 1] = 'REDACTED';
        }
      }
      scope.setExtra('argv', argv);

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
