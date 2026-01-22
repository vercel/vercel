import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import cmd from '../../util/output/cmd';
import { ensureLink } from '../../util/link/ensure-link';
import { ensureRepoLink } from '../../util/link/repo';
import { help } from '../help';
import { linkCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LinkTelemetryClient } from '../../util/telemetry/commands/link';
import { determineAgent } from '@vercel/detect-agent';

export default async function link(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(linkCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new LinkTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('link');
    output.print(help(linkCommand, { columns: client.stderr.columns }));
    return 0;
  }

  telemetry.trackCliFlagRepo(parsedArgs.flags['--repo']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);

  if ('--confirm' in parsedArgs.flags) {
    telemetry.trackCliFlagConfirm(parsedArgs.flags['--confirm']);
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    parsedArgs.flags['--yes'] = parsedArgs.flags['--confirm'];
  }

  const yes = !!parsedArgs.flags['--yes'];

  let cwd = parsedArgs.args[1];
  if (cwd) {
    telemetry.trackCliArgumentCwd();
    output.warn(
      `The ${cmd('vc link <directory>')} syntax is deprecated, please use ${cmd(
        `vc link --cwd ${cwd}`
      )} instead`
    );
  } else {
    cwd = client.cwd;
  }

  let projectName: string | undefined;
  let orgSlug: string | undefined;

  if (parsedArgs.flags['--repo']) {
    output.warn(`The ${cmd('--repo')} flag is in alpha, please report issues`);
    try {
      await ensureRepoLink(client, cwd, { yes, overwrite: true });
    } catch (err) {
      output.prettyError(err);
      return 1;
    }
  } else {
    const link = await ensureLink('link', client, cwd, {
      autoConfirm: yes,
      forceDelete: true,
      projectName: parsedArgs.flags['--project'],
      successEmoji: 'success',
    });

    if (typeof link === 'number') {
      return link;
    }

    projectName = link.project?.name;
    orgSlug = link.org?.slug;
  }

  // Auto-generate agent files if agent is detected
  const { isAgent } = await determineAgent();
  if (isAgent) {
    const { autoGenerateAgentFiles } = await import('../../util/agent-files');
    const agentResult = await autoGenerateAgentFiles(cwd, projectName, orgSlug);
    if (agentResult.status === 'generated' && agentResult.files.length > 0) {
      output.print(
        chalk.dim(
          `Generated agent configuration files with Vercel best practices\n`
        )
      );
    }
  }

  return 0;
}
