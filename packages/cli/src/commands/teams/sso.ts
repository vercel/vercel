import type Client from '../../util/client';
import type { Team } from '@vercel-internals/types';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { ssoSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import chalk from 'chalk';
import { isAPIError } from '../../util/errors-ts';

export default async function sso(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(ssoSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const { team } = await getScope(client);
  if (!team) {
    output.error('No team context. Run `vercel switch` or use --scope.');
    return 1;
  }

  try {
    const full = await client.fetch<Team & Record<string, unknown>>(
      `/teams/${encodeURIComponent(team.id)}`
    );
    const payload = {
      teamId: full.id,
      slug: full.slug,
      name: full.name,
      saml: full.saml ?? null,
    };

    if (formatResult.jsonOutput) {
      client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return 0;
    }

    output.log(`${chalk.bold('Team')} ${full.name} (${chalk.cyan(full.slug)})`);
    if (full.saml) {
      output.log(
        `${chalk.cyan('SAML enforced:')} ${String(full.saml.enforced)}`
      );
      if (full.saml.connection?.state) {
        output.log(
          `${chalk.cyan('Connection state:')} ${full.saml.connection.state}`
        );
      }
    } else {
      output.log(
        'No SAML configuration on this team (or not visible to your token).'
      );
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      output.error(err.serverMessage || `API error (${err.status})`);
      return 1;
    }
    throw err;
  }
}
