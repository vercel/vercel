import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithYes,
  exitWithNonInteractiveError,
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import { passportSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';

const PASSPORT_ACTIONS = ['set', 'disable'] as const;
type PassportAction = (typeof PASSPORT_ACTIONS)[number];

function isPassportAction(value: string | undefined): value is PassportAction {
  return !!value && (PASSPORT_ACTIONS as readonly string[]).includes(value);
}

export default async function passport(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(passportSubcommand.options);
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

  const action = isPassportAction(parsedArgs.args[0])
    ? parsedArgs.args[0]
    : undefined;

  if (!action) {
    output.error(
      'Invalid arguments. Usage: `vercel project passport set|disable [name] [--connector <id>]`'
    );
    return 2;
  }

  if (parsedArgs.args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: \`vercel project passport ${action} [name]\``
    );
    return 2;
  }

  const connector = parsedArgs.flags['--connector'];
  telemetry.trackCliOptionConnector(connector);

  if (action === 'set' && !connector) {
    output.error(
      'The `--connector <id>` option is required. Usage: `vercel project passport set [name] --connector <id>`'
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  let project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project passport',
      projectNameOrId: parsedArgs.args[1],
      forReadOnlyCommand: true,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'passport',
    });
    printError(err);
    return 1;
  }

  // Disabling Passport turns off access protection, so it is confirmed
  // interactively (or with --yes). `set` applies directly, per family
  // precedent. Kept outside the mutation try/catch so the non-interactive
  // `confirmation_required` exit is not re-reported as an unexpected error.
  if (action === 'disable' && !parsedArgs.flags['--yes']) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'confirmation_required',
          message: `Disabling Passport turns off access protection for ${project.name}. Use --yes to confirm.`,
          next: [{ command: buildCommandWithYes(client.argv) }],
        },
        1
      );
    }
    const confirmed = await client.input.confirm(
      `Disabling Passport turns off access protection for ${chalk.bold(
        project.name
      )}. Are you sure?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const enabled = action === 'set';

  try {
    await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      body: { passport: enabled ? { connectorId: connector } : null },
    });

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            enabled,
            connectorId: enabled ? connector : null,
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
      `Passport is ${enabled ? 'enabled' : 'disabled'} for ${project.name}.`
    );
    return 0;
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'passport',
    });
    printError(err);
    return 1;
  }
}
