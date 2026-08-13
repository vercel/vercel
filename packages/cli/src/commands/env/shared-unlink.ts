import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { unlinkSharedEnvProject } from '../../util/env/shared-env-mutations';
import resolveSharedEnvVariable from '../../util/env/resolve-shared-env';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { EnvSharedUnlinkTelemetryClient } from '../../util/telemetry/commands/env/shared-unlink';
import { sharedUnlinkSubcommand } from './command';

export default async function unlink(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EnvSharedUnlinkTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sharedUnlinkSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args, flags } = parsedArgs;
  const [nameOrId] = args;
  const project = flags['--project'];

  telemetry.trackCliArgumentNameOrId(nameOrId);
  telemetry.trackCliOptionProject(project);
  telemetry.trackCliFlagYes(flags['--yes']);

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('env shared unlink <name-or-id> --project <name-or-id>')}`
      )}`
    );
    return 1;
  }

  if (!project) {
    output.error(
      `Provide the project to unlink with ${chalk.cyan('--project')}.`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  output.spinner(
    `Resolving Shared Environment Variable under ${chalk.bold(contextName)}`
  );

  let resolved;
  try {
    resolved = await resolveSharedEnvVariable(client, nameOrId);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
  output.stopSpinner();

  if (resolved.status === 'not_found') {
    output.error(
      `No Shared Environment Variable ${chalk.bold(
        nameOrId
      )} found under ${chalk.bold(contextName)}.`
    );
    return 1;
  }
  if (resolved.status === 'ambiguous') {
    output.error(
      `Multiple Shared Environment Variables named ${chalk.bold(
        nameOrId
      )} were found. Unlink one by ID instead:`
    );
    for (const env of resolved.matches) {
      output.print(
        `  ${env.id}  ${chalk.gray(env.target?.join(', ') || '-')}\n`
      );
    }
    return 1;
  }

  const record = resolved.record;

  if (!flags['--yes'] && !client.nonInteractive) {
    const confirmed = await client.input.confirm(
      `Unlink project ${chalk.bold(project)} from Shared Environment Variable ${chalk.bold(
        record.key ?? record.id
      )}?`,
      true
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const unlinkStamp = stamp();
  output.spinner('Unlinking');

  try {
    await unlinkSharedEnvProject(client, record.id, project);
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err) && err.serverMessage) {
      output.error(err.serverMessage);
      return 1;
    }
    printError(err);
    return 1;
  }

  output.stopSpinner();

  printAlignedLabel('Unlinked', `${project} ${chalk.gray(unlinkStamp())}`, {
    gutter: '✓',
  });
  printAlignedLabel('Variable', record.key ?? record.id);
  printAlignedLabel('Team', contextName);

  return 0;
}
