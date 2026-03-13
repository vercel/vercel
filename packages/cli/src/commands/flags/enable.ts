import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { getFlag } from '../../util/flags/get-flags';
import { formatVariantForDisplay } from '../../util/flags/resolve-variant';
import { updateFlag } from '../../util/flags/update-flag';
import { logNonBooleanFlagGuidance } from '../../util/flags/log-non-boolean-guidance';
import { normalizeOptionalInput } from '../../util/flags/normalize-optional-input';
import {
  buildPausedEnvironmentConfig,
  getBooleanVariant,
  isPausingEnvironmentToVariant,
  resolveFlagEnvironment,
  resolveFlagUpdateMessage,
} from '../../util/flags/environment-variant';
import output from '../../output-manager';
import { FlagsEnableTelemetryClient } from '../../util/telemetry/commands/flags/enable';
import { enableSubcommand } from './command';

export default async function enable(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsEnableTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(enableSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const [flagArg] = args;
  let environment = flags['--environment'] as string | undefined;
  const message = normalizeOptionalInput(
    flags['--message'] as string | undefined
  );

  if (!flagArg) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: 'Please provide a flag slug or ID to enable.',
          next: [
            {
              command: getCommandNamePlain(
                'flags enable <flag> --environment <env>'
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error('Please provide a flag slug or ID to enable');
    output.log(
      `Example: ${getCommandName('flags enable my-feature --environment production')}`
    );
    return 1;
  }

  if (client.nonInteractive && !environment) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          'Please provide --environment (production, preview, or development).',
        next: [
          {
            command: getCommandNamePlain(
              `flags enable ${flagArg} --environment <env>`
            ),
          },
        ],
      },
      1
    );
    return 1;
  }

  telemetryClient.trackCliArgumentFlag(flagArg);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionMessage(message);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          message: 'Your codebase is not linked to a project. Run link first.',
          next: [{ command: getCommandNamePlain('link') }],
        },
        1
      );
      return 1;
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    if (!client.nonInteractive) {
      output.spinner('Fetching flag...');
    }
    const flag = await getFlag(client, project.id, flagArg);
    output.stopSpinner();

    if (flag.state === 'archived') {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'flag_archived',
            message: `Flag ${flag.slug} is archived and cannot be enabled.`,
            next: [],
          },
          1
        );
        return 1;
      }
      output.error(
        `Flag ${chalk.bold(flag.slug)} is archived and cannot be enabled`
      );
      return 1;
    }

    // Only boolean flags can be enabled/disabled via CLI
    if (flag.kind !== 'boolean') {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: 'not_boolean_flag',
            message: `The flags enable command only works with boolean flags. Flag ${flag.slug} is ${flag.kind}.`,
            next: [],
          },
          1
        );
        return 1;
      }
      logNonBooleanFlagGuidance(flag, {
        attemptedSubcommand: 'enable',
        environment,
        isInteractive: Boolean(client.stdin.isTTY),
        teamSlug: link.org.slug,
        projectName: project.name,
      });
      return 0;
    }

    environment = await resolveFlagEnvironment(
      client,
      flag,
      environment,
      'Select an environment to enable the flag in:'
    );

    const envConfig = flag.environments[environment];
    const onVariant = getBooleanVariant(flag, true);

    if (isPausingEnvironmentToVariant(envConfig, onVariant.id)) {
      if (client.nonInteractive) {
        client.stdout.write(
          `${JSON.stringify(
            {
              status: 'ok',
              flag: { slug: flag.slug },
              environment,
              message: 'Flag is already enabled in this environment.',
            },
            null,
            2
          )}\n`
        );
        return 0;
      }
      output.warn(
        `Flag ${chalk.bold(flag.slug)} is already enabled in ${environment}`
      );
      return 0;
    }

    const updateMessage = await resolveFlagUpdateMessage(
      client,
      message,
      getDefaultEnableMessage(environment)
    );

    if (!client.nonInteractive) {
      output.spinner(`Enabling flag in ${environment}...`);
    }
    await updateFlag(client, project.id, flagArg, {
      environments: {
        [environment]: buildPausedEnvironmentConfig(envConfig, onVariant.id),
      },
      message: updateMessage,
    });
    output.stopSpinner();

    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'ok',
            flag: { slug: flag.slug },
            environment,
            message: `Feature flag ${flag.slug} has been enabled in ${environment}.`,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.success(
      `Feature flag ${chalk.bold(flag.slug)} has been enabled in ${chalk.bold(environment)}`
    );
    output.log(
      `  ${chalk.dim('Serving variant:')} ${formatVariantForDisplay(onVariant)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function getDefaultEnableMessage(environment: string): string {
  return `Enabled for ${environment} via CLI`;
}
