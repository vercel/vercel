import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { speedInsightsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

interface ToggleResponse {
  value: boolean;
}

const SPEED_INSIGHTS_ACTIONS = ['enable', 'disable'] as const;
type SpeedInsightsAction = (typeof SPEED_INSIGHTS_ACTIONS)[number];

function isSpeedInsightsAction(
  v: string | undefined
): v is SpeedInsightsAction {
  return !!v && (SPEED_INSIGHTS_ACTIONS as readonly string[]).includes(v);
}

export default async function speedInsights(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    speedInsightsSubcommand.options
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

  const actionArg = parsedArgs.args[0];
  const action = isSpeedInsightsAction(actionArg) ? actionArg : undefined;
  const projectNameOrId = action ? parsedArgs.args[1] : parsedArgs.args[0];

  const maxArgs = action ? 2 : 1;
  if (parsedArgs.args.length > maxArgs) {
    output.error(
      `Invalid number of arguments. Usage: \`vercel project speed-insights ${
        action ? `${action} ` : ''
      }[name]\``
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const value = action !== 'disable';

  try {
    const project = await getProjectByCwdOrLink({
      client,
      commandName: 'project speed-insights',
      projectNameOrId,
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams({ projectId: project.id });
    const result = await client.fetch<ToggleResponse>(
      `/speed-insights/toggle?${query.toString()}`,
      {
        method: 'POST',
        json: true,
        body: { value },
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

    output.log(
      `Speed Insights is ${result.value ? 'enabled' : 'disabled'} for ${project.name}.`
    );
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'speed-insights',
    });
    printError(err);
    return 1;
  }
}
