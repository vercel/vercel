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
import resolveWhoamiLinkedScopeSlug from '../../util/resolve-whoami-scope';
import { getScopeOrTeamFromArgv } from '../../util/input/select-org';
import getUser from '../../util/get-user';
import { TeamDeleted } from '../../util/errors-ts';
import type { User } from '@vercel-internals/types';

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

  const linkedScopeSlug = await resolveWhoamiLinkedScopeSlug(
    client,
    client.cwd
  );

  let defaultScopeName: string;
  let user: User;
  try {
    const scope = await getScope(client, {});
    defaultScopeName = scope.contextName;
    user = scope.user;
  } catch (err) {
    if (err instanceof TeamDeleted) {
      user = await getUser(client);
      defaultScopeName = user.username || user.email || '';
    } else {
      throw err;
    }
  }

  const explicitScopeFromArgv = getScopeOrTeamFromArgv(client.argv);
  const scopeSlug =
    explicitScopeFromArgv != null && explicitScopeFromArgv !== ''
      ? defaultScopeName
      : (linkedScopeSlug ?? defaultScopeName);
  const primary = user.username || user.email || '';

  if (asJson) {
    const jsonOutput = {
      username: user.username,
      email: user.email,
      name: user.name,
      scope: scopeSlug,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (client.stdout.isTTY) {
    output.log(scopeSlug === primary ? primary : `${primary} (${scopeSlug})`);
  } else {
    // If stdout is not a TTY, then only print the username
    // to support piping the output to another file / exe
    client.stdout.write(`${primary}\n`);
  }

  return 0;
}
