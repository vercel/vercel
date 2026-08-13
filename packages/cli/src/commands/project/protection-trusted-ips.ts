import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  buildCommandWithGlobalFlags,
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { trustedIpsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import type { Project } from '@vercel-internals/types';

const TRUSTED_IPS_ACTIONS = ['get'] as const;
type TrustedIpsAction = (typeof TRUSTED_IPS_ACTIONS)[number];

// Verbatim from the public project PATCH schema (trustedIps.deploymentType).
type DeploymentScope =
  | 'all'
  | 'preview'
  | 'production'
  | 'prod_deployment_urls_and_all_previews'
  | 'all_except_custom_domains';

// Verbatim from the public project PATCH schema (trustedIps.protectionMode).
type ProtectionMode = 'additional' | 'exclusive';

interface TrustedIpAddress {
  value: string;
  note?: string;
}

interface TrustedIpsConfig {
  deploymentType: DeploymentScope;
  addresses: TrustedIpAddress[];
  protectionMode: ProtectionMode;
}

function isTrustedIpsAction(v: string | undefined): v is TrustedIpsAction {
  return !!v && (TRUSTED_IPS_ACTIONS as readonly string[]).includes(v);
}

function readTrustedIps(project: Project): TrustedIpsConfig | null {
  const raw = project as Project & Record<string, unknown>;
  const value = raw.trustedIps;
  if (!value || typeof value !== 'object') return null;
  return value as TrustedIpsConfig;
}

export async function projectProtectionTrustedIps(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    trustedIpsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: error instanceof Error ? error.message : String(error),
      },
      1
    );
    printError(error);
    return 1;
  }

  const actionArg = parsedArgs.args[0];
  const action = isTrustedIpsAction(actionArg) ? actionArg : undefined;

  if (!action) {
    const msg =
      'Invalid action. Usage: `vercel project protection trusted-ips get [name]`';
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'project protection trusted-ips get'
            ),
            when: 'Show the current Trusted IPs allowlist',
          },
        ],
      },
      2
    );
    output.error(msg);
    return 2;
  }

  if (parsedArgs.args.length > 2) {
    const msg = `Invalid arguments. Usage: \`vercel project protection trusted-ips ${action} [name]\``;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      },
      2
    );
    output.error(msg);
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: formatResult.error,
      },
      1
    );
    output.error(formatResult.error);
    return 1;
  }
  const preferJson = formatResult.jsonOutput || Boolean(client.nonInteractive);

  telemetry.trackCliArgumentAction(action);

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project protection trusted-ips',
      projectNameOrId: parsedArgs.args[1],
      forReadOnlyCommand: true,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
    printError(err);
    return 1;
  }

  const config = readTrustedIps(project);
  if (preferJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          projectId: project.id,
          name: project.name,
          trustedIps: config,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }
  output.log(
    `${chalk.bold('Trusted IPs')} for ${chalk.cyan(project.name)} (${project.id})`
  );
  if (!config) {
    output.log('Trusted IPs are not configured for this project.');
    return 0;
  }
  output.log(`${chalk.cyan('scope:')} ${config.deploymentType}`);
  output.log(`${chalk.cyan('mode:')} ${config.protectionMode}`);
  output.log(`${chalk.cyan('addresses:')}`);
  for (const addr of config.addresses ?? []) {
    output.log(`  - ${addr.value}${addr.note ? ` (${addr.note})` : ''}`);
  }
  return 0;
}
