import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { getFlag } from '../../util/flags/get-flags';
import { updateFlag } from '../../util/flags/update-flag';
import { experimentStopSubcommand } from './command';

export default async function stop(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    experimentStopSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const slug = parsedArgs.args[0];
  if (!slug) {
    output.error(
      'Missing flag slug. Example: `vc experiment stop my-experiment`.'
    );
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  output.spinner(`Stopping experiment ${slug}`);

  try {
    const flag = await getFlag(client, project.id, slug);
    if (!flag.experiment) {
      output.stopSpinner();
      output.error(`Flag "${slug}" has no experiment configuration.`);
      return 1;
    }

    const endedAt = Date.now();
    const updated = await updateFlag(client, project.id, slug, {
      experiment: {
        ...flag.experiment,
        status: 'closed',
        endedAt,
      },
    });
    output.stopSpinner();

    if (asJson) {
      output.print(JSON.stringify({ flag: updated }, null, 2));
    } else {
      output.log(`Experiment "${slug}" is closed (endedAt=${endedAt}).`);
    }
    return 0;
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
