import chalk from 'chalk';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { getRawProjectLink } from '../../util/projects/link';
import { validateJsonOutput } from '../../util/output-format';
import { tokenSubcommand } from './command';

export default async function getOidcToken(client: Client, argv: string[]) {
  const flagsSpecification = getFlagsSpecification(tokenSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  client.nonInteractive = true;

  if (args.length > 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project token <name>')}`
      )}`
    );
    return 1;
  }
  const [name] = args;
  let token: string | null = null;

  // Fast path: when no explicit project name is given, try the token endpoint
  // directly from the link without validating it first. This avoids two API
  // calls in the common case. If it fails, fall back to the validation flow.
  if (!name) {
    const link = await getRawProjectLink(client, client.cwd);
    if (link) {
      try {
        token = await fetchProjectToken(client, link.projectId, link.orgId);
      } catch (_err) {
        // Fall through to the validation flow for a better error message.
      }
    }
  }

  if (token) {
    writeTokenOutput(token, asJson, client);
    return 0;
  }

  // Slow path: validate the project/link first, then get token.
  const project = await getProjectByCwdOrLink({
    autoConfirm: Boolean(flags['--yes']),
    nonInteractive: true,
    client,
    commandName: 'project token',
    projectNameOrId: name,
  });
  try {
    token = await fetchProjectToken(client, project.id, project.accountId);
  } catch (err: unknown) {
    if (isAPIError(err) && err.status === 404) {
      output.error('No such project exists');
      return 1;
    }
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    output.error(`An unexpected error occurred!\n${err as string}`);
    return 1;
  }

  writeTokenOutput(token, asJson, client);
  return 0;
}

async function fetchProjectToken(
  client: Client,
  projectId: string,
  teamId: string
): Promise<string> {
  const res = await client.fetch<{ token: string }>(
    `/projects/${projectId}/token`,
    {
      method: 'POST',
      accountId: teamId,
      body: JSON.stringify({
        source: 'vercel-cli',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  return res.token;
}

function writeTokenOutput(token: string, asJson: boolean, client: Client) {
  if (asJson) {
    client.stdout.write(`${JSON.stringify({ token }, null, 2)}\n`);
  } else {
    client.stdout.write(`${token}\n`);
  }
}
