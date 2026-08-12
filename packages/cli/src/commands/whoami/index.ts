import chalk from 'chalk';
import { help } from '../help';
import { whoamiCommand } from './command';

import getScope, { type ScopeContext } from '../../util/get-scope';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { WhoamiTelemetryClient } from '../../util/telemetry/commands/whoami';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';

export default async function whoami(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(whoamiCommand.options);

  const telemetry = new WhoamiTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('whoami');
    output.print(help(whoamiCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  if (!client.authConfig.token) {
    if (asJson) {
      client.stdout.write(`${JSON.stringify({ loggedIn: false }, null, 2)}\n`);
    } else {
      output.log('Logged out.');
      output.log(
        `Run ${getCommandName('deploy')} to deploy without an account and claim it later. Alternatively you can login with ${getCommandName('login')}.`
      );
    }
    return 1;
  }

  const scope = await getScope(client, { resolveLocalScope: true });
  const { user, team, app, globalTeam } = scope;

  // A local override exists when the effective team (from the linked project)
  // differs from the globally-selected team (from `vc switch`). We only treat
  // it as an override when it wasn't caused by an explicit `--scope`/`--team`
  // flag, since those are user-directed rather than context-inferred.
  const hasLocalOverride =
    !scope.explicitScopeProvided &&
    ((team?.id ?? null) !== (globalTeam?.id ?? null) ||
      // `team` being null while a local project linked to personal scope
      // exists while a global team is selected is also a mismatch.
      scope.scopeMismatch);

  if (asJson) {
    const jsonOutput: any = {
      team: team ? { id: team.id, slug: team.slug, name: team.name } : null,
    };

    if (user) {
      jsonOutput.username = user.username;
      jsonOutput.email = user.email;
      jsonOutput.name = user.name;
    }

    if (app) {
      jsonOutput.app = app;
    }

    if (hasLocalOverride) {
      jsonOutput.localOverride = true;
      jsonOutput.globalTeam = globalTeam
        ? { id: globalTeam.id, slug: globalTeam.slug, name: globalTeam.name }
        : null;
    }
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (client.stdout.isTTY) {
    output.log(`Logged in as ${chalk.bold(formatUsername(scope))}`);

    if (team) {
      output.log(
        `Active team: ${chalk.bold(team.slug)}${
          team.name && team.name !== team.slug ? ` (${team.name})` : ''
        }`
      );
    } else {
      output.log(`Active team: ${chalk.bold('Personal Account')}`);
    }
    if (hasLocalOverride) {
      const globalLabel = globalTeam ? globalTeam.slug : 'Personal Account';
      const localLabel = team ? team.slug : 'Personal Account';
      output.log(
        `${chalk.yellow('Local override:')} scope is set to ${chalk.bold(
          localLabel
        )} by the linked project in this directory (globally selected: ${chalk.bold(
          globalLabel
        )}).`
      );
    }
  } else {
    // If stdout is not a TTY, only print the username to support piping
    // the output to another file / executable. This preserves the previous
    // behavior for scripts that rely on `vc whoami` printing the logged-in
    // user. Team information is available via `--json`.
    client.stdout.write(`${formatUsername(scope)}\n`);
  }

  return 0;
}

function formatUsername(scope: ScopeContext): string {
  if (scope.user) {
    return scope.user.username;
  }

  if (scope.app) {
    return scope.app.id;
  }

  throw new Error(`Could not format principal identity`);
}
