import chalk from 'chalk';
import { help } from '../help';
import { whoamiCommand } from './command';

import getScope from '../../util/get-scope';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { WhoamiTelemetryClient } from '../../util/telemetry/commands/whoami';
import { validateJsonOutput } from '../../util/output-format';

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

  const scope = await getScope(client, {
    resolveLocalScope: true,
  });
  const { app, user, team } = scope;
  // The team's slug/name may be absent for an app principal that can't read its
  // team, so fall back to the id for display.
  const teamLabel = team ? (team.slug ?? team.id) : null;

  // A local override exists when the effective team (from the linked project)
  // differs from the globally-selected team (from `vc switch`). We only treat
  // it as an override when it wasn't caused by an explicit `--scope`/`--team`
  // flag, since those are user-directed rather than context-inferred.
  const hasLocalOverride =
    !scope.explicitScopeProvided &&
    ((team?.id ?? null) !== (scope.globalTeam?.id ?? null) ||
      // `team` being null while a local project linked to personal scope
      // exists while a global team is selected is also a mismatch.
      scope.scopeMismatch);

  if (asJson) {
    const jsonOutput = app
      ? {
          principal: {
            type: 'app' as const,
            id: app.id,
            name: app.name,
          },
          app: {
            id: app.id,
            name: app.name,
          },
          team: team ? { id: team.id, slug: team.slug, name: team.name } : null,
        }
      : {
          username: user?.username,
          email: user?.email,
          name: user?.name,
          team: team ? { id: team.id, slug: team.slug, name: team.name } : null,
          globalTeam: undefined as
            | { id: string; slug: string; name: string }
            | null
            | undefined,
          localOverride: undefined as boolean | undefined,
        };
    if (hasLocalOverride && !app) {
      jsonOutput.localOverride = true;
      jsonOutput.globalTeam = scope.globalTeam
        ? {
            id: scope.globalTeam.id,
            slug: scope.globalTeam.slug,
            name: scope.globalTeam.name,
          }
        : null;
    }
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (client.stdout.isTTY) {
    const identityLabel = app
      ? `Vercel App: ${chalk.bold(app.name ?? app.id)}`
      : chalk.bold(user?.username ?? '');
    output.log(`Logged in as ${identityLabel}`);
    if (team) {
      output.log(
        `Active team: ${chalk.bold(teamLabel)}${
          team.name && team.name !== teamLabel ? ` (${team.name})` : ''
        }`
      );
    } else if (!app) {
      output.log(`Active team: ${chalk.bold('Personal Account')}`);
    }
    if (hasLocalOverride && !app) {
      const globalLabel = scope.globalTeam
        ? scope.globalTeam.slug
        : 'Personal Account';
      const localLabel = teamLabel ?? 'Personal Account';
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
    // user. Team information is available via `--format json`.
    client.stdout.write(`${app ? (app.name ?? app.id) : user?.username}\n`);
  }

  return 0;
}
