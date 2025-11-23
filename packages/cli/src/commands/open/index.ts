import open from 'open';
import { help } from '../help';
import { openCommand } from './command';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import { OpenTelemetryClient } from '../../util/telemetry/commands/open';

export default async function openCommandHandler(
  client: Client
): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(openCommand.options);

  const telemetry = new OpenTelemetryClient({
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
    telemetry.trackCliFlagHelp('open');
    output.print(help(openCommand, { columns: client.stderr.columns }));
    return 0;
  }

  // Check if project is linked first to avoid prompting in non-interactive mode
  const { getLinkedProject } = await import('../../util/projects/link');
  const linkCheck = await getLinkedProject(client, client.cwd);

  if (linkCheck.status !== 'linked' || !linkCheck.org || !linkCheck.project) {
    output.error('This command requires a linked project. Please run:');
    output.print(`  vercel link\n`);
    return 1;
  }

  // Ensure the project is linked (this will validate the link but won't prompt if already linked)
  const link = await ensureLink('open', client, client.cwd);

  if (typeof link === 'number') {
    return link;
  }

  if (link.status !== 'linked' || !link.org || !link.project) {
    output.error('This command requires a linked project. Please run:');
    output.print('  vercel link\n');
    return 1;
  }

  const { org, project } = link;
  const projectUrl = `https://vercel.com/${org.slug}/${project.name}`;

  output.log(`Opening ${projectUrl} in your browser...`);
  await open(projectUrl);

  return 0;
}
