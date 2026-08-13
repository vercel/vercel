import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { observabilitySubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

const OBSERVABILITY_ACTIONS = ['enable', 'disable'] as const;
type ObservabilityAction = (typeof OBSERVABILITY_ACTIONS)[number];

function isObservabilityAction(
  value: string | undefined
): value is ObservabilityAction {
  return (
    !!value && (OBSERVABILITY_ACTIONS as readonly string[]).includes(value)
  );
}

export default async function observability(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    observabilitySubcommand.options
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

  const action = isObservabilityAction(parsedArgs.args[0])
    ? parsedArgs.args[0]
    : undefined;

  if (!action) {
    output.error(
      'Invalid arguments. Usage: `vercel project observability enable|disable [name]`'
    );
    return 2;
  }

  if (parsedArgs.args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: \`vercel project observability ${action} [name]\``
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
      commandName: 'project observability',
      projectNameOrId: parsedArgs.args[1],
      forReadOnlyCommand: true,
    });

    const disabled = action === 'disable';
    await client.fetch(
      `/v1/observability/manage/configuration/projects/${encodeURIComponent(
        project.id
      )}`,
      {
        method: 'PUT',
        json: true,
        body: { disabled },
      }
    );

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            enabled: !disabled,
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
      `Observability Plus is ${
        disabled ? 'disabled' : 'enabled'
      } for ${project.name}.`
    );
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'observability',
    });
    printError(err);
    return 1;
  }
}
