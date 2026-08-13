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
import type { JSONObject, Project } from '@vercel-internals/types';

const TRUSTED_IPS_ACTIONS = ['get', 'set', 'disable'] as const;
type TrustedIpsAction = (typeof TRUSTED_IPS_ACTIONS)[number];

// Verbatim from the public project PATCH schema (trustedIps.deploymentType).
const DEPLOYMENT_SCOPES = [
  'all',
  'preview',
  'production',
  'prod_deployment_urls_and_all_previews',
  'all_except_custom_domains',
] as const;
type DeploymentScope = (typeof DEPLOYMENT_SCOPES)[number];

// Verbatim from the public project PATCH schema (trustedIps.protectionMode).
const PROTECTION_MODES = ['additional', 'exclusive'] as const;
type ProtectionMode = (typeof PROTECTION_MODES)[number];

// Schema: note has maxLength 20.
const MAX_NOTE_LENGTH = 20;

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

/**
 * Validate an IPv4 address or IPv4 CIDR string locally. IPv6 is intentionally
 * rejected because the API does not support it. This is a security-critical
 * gate: never forward unvalidated address strings to the remote PATCH.
 */
function isValidIpv4OrCidr(value: string): boolean {
  const [addr, ...rest] = value.split('/');
  if (rest.length > 1) return false;

  if (rest.length === 1) {
    const prefix = rest[0];
    if (!/^\d{1,2}$/.test(prefix)) return false;
    const prefixNum = Number(prefix);
    if (prefixNum < 0 || prefixNum > 32) return false;
  }

  const octets = addr.split('.');
  if (octets.length !== 4) return false;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const n = Number(octet);
    if (n < 0 || n > 255) return false;
    // Reject non-canonical leading zeros (e.g. "01").
    if (octet.length > 1 && octet[0] === '0') return false;
  }
  return true;
}

/**
 * Parse a single `--ip` value into an address plus optional note. Notes are
 * separated with `=`; an IPv4/CIDR value never contains `=`, so splitting on
 * the first `=` is unambiguous.
 */
function parseIpEntry(
  raw: string
): { ok: true; entry: TrustedIpAddress } | { ok: false; message: string } {
  const trimmed = raw.trim();
  const eqIndex = trimmed.indexOf('=');
  const value = (eqIndex === -1 ? trimmed : trimmed.slice(0, eqIndex)).trim();
  const note =
    eqIndex === -1 ? undefined : trimmed.slice(eqIndex + 1).trim() || undefined;

  if (value === '') {
    return {
      ok: false,
      message: `Invalid --ip: expected an IPv4 address or CIDR, received an empty value.`,
    };
  }
  if (value.includes(':')) {
    return {
      ok: false,
      message: `Invalid --ip "${value}": IPv6 addresses are not supported.`,
    };
  }
  if (!isValidIpv4OrCidr(value)) {
    return {
      ok: false,
      message: `Invalid --ip "${value}": expected an IPv4 address (e.g. 203.0.113.4) or CIDR (e.g. 198.51.100.0/24).`,
    };
  }
  if (note !== undefined && note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      message: `Invalid note for --ip "${value}": notes must be at most ${MAX_NOTE_LENGTH} characters.`,
    };
  }

  return {
    ok: true,
    entry: note === undefined ? { value } : { value, note },
  };
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
      'Invalid action. Usage: `vercel project protection trusted-ips get|set|disable [name]`';
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

  const scopeFlag = parsedArgs.flags['--deployment-type'] as string | undefined;
  const modeFlag = parsedArgs.flags['--mode'] as string | undefined;
  const ipFlags = (parsedArgs.flags['--ip'] as string[] | undefined) ?? [];
  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);

  // Telemetry: enums verbatim (allowlisted); IPs redacted (sensitive infra).
  telemetry.trackCliArgumentAction(action);
  telemetry.trackCliOptionDeploymentType(scopeFlag);
  telemetry.trackCliOptionMode(modeFlag);
  telemetry.trackCliOptionIp(ipFlags);
  telemetry.trackCliFlagYes(skipConfirmation);

  // Local validation must happen before any remote lookup or mutation.
  let trustedIpsBody: TrustedIpsConfig | undefined;
  if (action === 'set') {
    if (
      !scopeFlag ||
      !DEPLOYMENT_SCOPES.includes(scopeFlag as DeploymentScope)
    ) {
      const msg = `\`--deployment-type\` is required and must be one of: ${DEPLOYMENT_SCOPES.join(', ')}`;
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: msg,
        },
        1
      );
      output.error(msg);
      return 1;
    }
    if (!modeFlag || !PROTECTION_MODES.includes(modeFlag as ProtectionMode)) {
      const msg = `\`--mode\` is required and must be one of: ${PROTECTION_MODES.join(', ')}`;
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: msg,
        },
        1
      );
      output.error(msg);
      return 1;
    }
    if (ipFlags.length === 0) {
      const msg =
        'At least one `--ip <address|CIDR>` is required to set Trusted IPs.';
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: msg,
        },
        1
      );
      output.error(msg);
      return 1;
    }

    const addresses: TrustedIpAddress[] = [];
    const seen = new Set<string>();
    for (const raw of ipFlags) {
      const parsed = parseIpEntry(raw);
      if (!parsed.ok) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.INVALID_ARGUMENTS,
            message: parsed.message,
          },
          1
        );
        output.error(parsed.message);
        return 1;
      }
      if (seen.has(parsed.entry.value)) {
        const msg = `Duplicate IP address "${parsed.entry.value}" in --ip.`;
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.INVALID_ARGUMENTS,
            message: msg,
          },
          1
        );
        output.error(msg);
        return 1;
      }
      seen.add(parsed.entry.value);
      addresses.push(parsed.entry);
    }

    trustedIpsBody = {
      deploymentType: scopeFlag as DeploymentScope,
      addresses,
      protectionMode: modeFlag as ProtectionMode,
    };
  } else if (scopeFlag || modeFlag || ipFlags.length > 0) {
    const msg = `\`--ip\`, \`--deployment-type\`, and \`--mode\` can only be used with \`project protection trusted-ips set\`.`;
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

  // disable requires confirmation before the destructive clear.
  if (action === 'disable' && !skipConfirmation) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.CONFIRMATION_REQUIRED,
          message:
            'Confirm clearing the Trusted IPs allowlist by adding --yes.',
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `project protection trusted-ips disable ${parsedArgs.args[1] ?? ''}`.trim() +
                  ' --yes'
              ),
              when: 'confirm and clear the Trusted IPs allowlist',
            },
          ],
        },
        1
      );
      return 1;
    }
    if (!client.stdin.isTTY) {
      output.error(
        'Missing required flag --yes. Use --yes to skip the confirmation prompt in non-interactive mode.'
      );
      return 1;
    }
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project protection trusted-ips',
      projectNameOrId: parsedArgs.args[1],
      forReadOnlyCommand: action === 'get',
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
    printError(err);
    return 1;
  }

  if (action === 'get') {
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

  if (action === 'disable' && !skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Clear the Trusted IPs allowlist for ${chalk.bold(project.name)}?`,
      false
    );
    if (!confirmed) {
      output.log('Aborted');
      return 0;
    }
  }

  const patchBody: JSONObject = {
    trustedIps:
      action === 'set' ? (trustedIpsBody as unknown as JSONObject) : null,
  };

  try {
    await client.fetch(`/v9/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      body: patchBody,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'protection' });
    printError(err);
    return 1;
  }

  if (preferJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          action,
          projectId: project.id,
          projectName: project.name,
          trustedIps: action === 'set' ? trustedIpsBody : null,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.log(
    action === 'set'
      ? `${chalk.bold('Trusted IPs')} updated for ${chalk.cyan(project.name)}`
      : `${chalk.bold('Trusted IPs')} cleared for ${chalk.cyan(project.name)}`
  );
  return 0;
}
