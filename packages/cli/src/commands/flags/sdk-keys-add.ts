import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { createSdkKey } from '../../util/flags/sdk-keys';
import output from '../../output-manager';
import { FlagsSdkKeysAddTelemetryClient } from '../../util/telemetry/commands/flags/sdk-keys';
import { sdkKeysAddSubcommand } from './command';
import type { CreateSdkKeyRequest } from '../../util/flags/types';

const VALID_TYPES = ['server', 'client', 'mobile'] as const;
const VALID_ENVIRONMENTS = ['production', 'preview', 'development'];

export default async function sdkKeysAdd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSdkKeysAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sdkKeysAddSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;
  let sdkKeyType = flags['--type'] as (typeof VALID_TYPES)[number] | undefined;
  let environment = flags['--environment'] as string | undefined;
  const label = flags['--label'] as string | undefined;

  telemetryClient.trackCliOptionType(sdkKeyType);
  telemetryClient.trackCliOptionEnvironment(environment);
  telemetryClient.trackCliOptionLabel(label);

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

  if (client.nonInteractive) {
    if (!sdkKeyType) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: 'Please provide --type (server, client, or mobile).',
          next: [
            {
              command: getCommandNamePlain(
                'flags sdk-keys add --type <type> --environment <env>'
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
    if (!environment) {
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
                `flags sdk-keys add --type ${sdkKeyType ?? 'server'} --environment <env>`
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  // Prompt for type if not provided
  if (!sdkKeyType && !client.nonInteractive) {
    sdkKeyType = await client.input.select({
      message: 'Select the SDK key type:',
      choices: [
        {
          name: 'Server (for backend/server-side usage)',
          value: 'server' as const,
        },
        {
          name: 'Client (for browser/frontend usage)',
          value: 'client' as const,
        },
        { name: 'Mobile (for mobile app usage)', value: 'mobile' as const },
      ],
    });
  }

  if (sdkKeyType === undefined || !VALID_TYPES.includes(sdkKeyType)) {
    output.error(
      `Invalid type: ${sdkKeyType}. Must be one of: ${VALID_TYPES.join(', ')}`
    );
    return 1;
  }

  // Prompt for environment if not provided
  if (!environment && !client.nonInteractive) {
    environment = await client.input.select({
      message: 'Select the environment:',
      choices: VALID_ENVIRONMENTS.map(env => ({
        name: env,
        value: env,
      })),
    });
  }

  if (environment === undefined || !VALID_ENVIRONMENTS.includes(environment)) {
    output.error(
      `Invalid environment: ${environment}. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`
    );
    return 1;
  }

  // Optionally prompt for label
  let finalLabel = label;
  if (!finalLabel && client.stdin.isTTY) {
    finalLabel = await client.input.text({
      message:
        'Enter an optional label for this SDK key (press Enter to skip):',
    });
    if (finalLabel === '') {
      finalLabel = undefined;
    }
  }

  const request: CreateSdkKeyRequest = {
    sdkKeyType: sdkKeyType as 'server' | 'client' | 'mobile',
    environment: environment as string,
    label: finalLabel,
  };

  try {
    if (!client.nonInteractive) {
      output.spinner('Creating SDK key...');
    }
    const key = await createSdkKey(client, project.id, request);
    output.stopSpinner();

    if (client.nonInteractive) {
      const json: Record<string, unknown> = {
        status: 'ok',
        key: {
          hashKey: key.hashKey,
          type: key.type,
          environment: key.environment,
          ...(key.label ? { label: key.label } : {}),
        },
        message: 'SDK key created successfully.',
      };
      if (key.keyValue) json.keyValue = key.keyValue;
      if (key.connectionString) json.connectionString = key.connectionString;
      client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
      return 0;
    }

    output.success('SDK key created successfully');
    output.print('\n');
    output.print(`  ${chalk.dim('Hash Key:')}     ${key.hashKey}\n`);
    output.print(`  ${chalk.dim('Type:')}         ${key.type}\n`);
    output.print(`  ${chalk.dim('Environment:')}  ${key.environment}\n`);
    if (key.label) {
      output.print(`  ${chalk.dim('Label:')}        ${key.label}\n`);
    }

    // Show the key value if it's returned (only on creation)
    if (key.keyValue) {
      output.print('\n');
      output.warn('Save this key - it will not be shown again:');
      output.print(`\n  ${chalk.cyan(key.keyValue)}\n`);
    }

    if (key.connectionString) {
      output.print('\n');
      output.log(`${chalk.dim('Connection string:')}`);
      output.print(`  ${chalk.cyan(key.connectionString)}\n`);
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
