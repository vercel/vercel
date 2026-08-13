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

const WEB_ANALYTICS_ACTIONS = ['enable', 'disable'] as const;
type WebAnalyticsAction = (typeof WEB_ANALYTICS_ACTIONS)[number];

function isWebAnalyticsAction(v: string | undefined): v is WebAnalyticsAction {
  return !!v && (WEB_ANALYTICS_ACTIONS as readonly string[]).includes(v);
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

  const actionArg = parsedArgs.args[0];
  const action = isWebAnalyticsAction(actionArg) ? actionArg : undefined;
  // Back-compat: with no explicit action, the first argument is the project
  // name and the command enables Web Analytics, exactly as before.
  const projectNameOrId = action ? parsedArgs.args[1] : parsedArgs.args[0];
  const enable = action !== 'disable';

  if (!action && parsedArgs.args.length > 1) {
    output.error(
      'Invalid number of arguments. Usage: `vercel project web-analytics [name]`'
    );
    return 2;
  }
  if (action && parsedArgs.args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: \`vercel project web-analytics ${action} [name]\``
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
      projectNameOrId,
      forReadOnlyCommand: true,
    });

    const query = new URLSearchParams({ projectId: project.id });
    const result = await client.fetch<ToggleResponse>(
      `/web/insights/toggle?${query.toString()}`,
      {
        method: 'POST',
        json: true,
        body: { value: enable },
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
      result.value
        ? `Web Analytics is enabled for ${project.name}.`
        : `Web Analytics is disabled for ${project.name}.`
    );
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'web-analytics',
    });
    printError(err);
    return 1;
  }
}
