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
import { TeamDeleted } from '../../util/errors-ts';

export default async function whoami(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(whoamiCommand.options);

  const telemetry = new WhoamiTelemetryClient({
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

  let scope = await getScope(client).catch(async error => {
    // Preserve whoami as a resilient informational command when currentTeam is stale.
    if (!(error instanceof TeamDeleted)) {
      throw error;
    }
    return getScope(client, { getTeam: false });
  });
  const { contextName, team, user } = scope;
  const plan = team?.billing.plan ?? user.billing?.plan ?? null;

  if (asJson) {
    const jsonOutput = {
      username: user.username,
      email: user.email,
      name: user.name,
      plan,
      scope: {
        type: team ? 'team' : 'user',
        name: contextName,
      },
      team: team
        ? {
            id: team.id,
            slug: team.slug,
            name: team.name,
          }
        : null,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (client.stdout.isTTY) {
    output.log(plan ? `${contextName} (${plan})` : contextName);
  } else {
    // If stdout is not a TTY, then only print the username
    // to support piping the output to another file / exe
    client.stdout.write(`${contextName}\n`);
  }

  return 0;
}
