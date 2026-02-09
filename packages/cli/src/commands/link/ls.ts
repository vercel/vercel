import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import formatTable from '../../util/format-table';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { findAllProjectLinks } from '../../util/link/find-local-links';
import { LinkLsTelemetryClient } from '../../util/telemetry/commands/link/ls';

export default async function ls(client: Client, argv: string[]) {
  const telemetryClient = new LinkLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }
  const { flags } = parsedArgs;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetryClient.trackCliSubcommandList('ls');
  telemetryClient.trackCliFlagFormat(flags['--format']);

  const projects = await findAllProjectLinks(client, client.cwd);

  if (projects.length === 0) {
    if (asJson) {
      output.stopSpinner();
      client.stdout.write(`${JSON.stringify({ projects: [] }, null, 2)}\n`);
    } else {
      output.log('No linked projects found in this directory.');
    }
    return 0;
  }

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      projects: projects.map(p => ({
        path: p.path,
        orgId: p.orgId,
        projectId: p.projectId,
      })),
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
    output.log(
      `Found ${chalk.bold(projects.length)} linked ${projects.length === 1 ? 'project' : 'projects'}`
    );
    client.stdout.write(`${getTable(projects)}\n`);
  }

  return 0;
}

function getTable(
  projects: Array<{ path: string; orgId: string; projectId: string }>
) {
  return formatTable(
    ['path', 'orgId', 'projectId'],
    ['l', 'l', 'l'],
    [
      {
        name: '',
        rows: projects.map(p => [
          chalk.bold(p.path),
          chalk.gray(p.orgId),
          chalk.cyan(p.projectId),
        ]),
      },
    ]
  );
}
