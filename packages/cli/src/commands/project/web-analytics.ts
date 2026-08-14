import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { webAnalyticsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

interface ToggleResponse {
  value: boolean;
}

export default async function webAnalytics(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    webAnalyticsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  if (parsedArgs.args.length > 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel project web-analytics [name]`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project web-analytics',
      projectNameOrId: parsedArgs.args[0],
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams({ projectId: project.id });
    const result = await client.fetch<ToggleResponse>(
      `/web/insights/toggle?${query.toString()}`,
      {
        method: 'POST',
        json: true,
        body: { value: true },
      }
    );

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            enabled: result.value,
            projectId: project.id,
            projectName: project.name,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.log(`Web Analytics is enabled for ${project.name}.`);
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'web-analytics',
    });
    printError(err);
    return 1;
  }
}
