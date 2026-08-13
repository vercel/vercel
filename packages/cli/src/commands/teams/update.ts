import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import type Client from '../../util/client';
import type { Team } from '@vercel-internals/types';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import getTeams from '../../util/teams/get-teams';
import updateTeam, {
  type DeploymentPolicyRules,
  type TeamUpdatePayload,
} from '../../util/teams/update-team';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  buildCommandWithYes,
  outputActionRequired,
  outputAgentError,
  withGlobalFlags,
} from '../../util/agent-output';
import { updateSubcommand } from './command';
import { TeamsUpdateTelemetryClient } from '../../util/telemetry/commands/teams/update';

const ON_OFF_DEFAULT_VALUES = ['on', 'off', 'default'] as const;
const BUILD_MACHINE_VALUES = [
  'basic',
  'standard',
  'enhanced',
  'turbo',
  'elastic',
] as const;
const ON_OFF_VALUES = ['on', 'off'] as const;
type OnOff = (typeof ON_OFF_VALUES)[number];

const validateSlug = (value: string) => /^[a-z]+[a-z0-9_-]*$/.test(value);

/** Sentinel returned by parsePolicyRules for values that fail validation. */
const INVALID_POLICY = Symbol('invalid-policy');

/**
 * Parses a deployment-policy flag value: the literal `null` clears the rule
 * list; otherwise the value must be a JSON array whose entries are objects
 * with `enabled`, `environments`, and `sources`. Rule internals (environment
 * scopes, source enums) are validated by the API.
 */
function parsePolicyRules(
  value: string
): DeploymentPolicyRules | typeof INVALID_POLICY {
  const trimmed = value.trim();
  if (trimmed === 'null') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return INVALID_POLICY;
  }
  if (parsed === null) {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return INVALID_POLICY;
  }
  for (const rule of parsed) {
    if (
      typeof rule !== 'object' ||
      rule === null ||
      Array.isArray(rule) ||
      typeof rule.enabled !== 'boolean' ||
      !Array.isArray(rule.environments) ||
      !Array.isArray(rule.sources)
    ) {
      return INVALID_POLICY;
    }
  }
  return parsed as DeploymentPolicyRules;
}

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new TeamsUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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

  const { flags, args } = parsedArgs;
  const [teamSlugArg] = args;

  const nameFlag = flags['--name'];
  const slugFlag = flags['--slug'];
  const previewSuffixFlag = flags['--preview-suffix'];
  const toolbarFlag = flags['--toolbar'];
  const buildMachineFlag = flags['--default-build-machine'];
  const verifiedCommitsFlag = flags['--require-verified-commits'];
  const sensitiveEnvPolicyFlag = flags['--sensitive-env-policy'];
  const ipVisibilityFlag = flags['--ip-visibility'];
  const gitSourcePolicyFlag = flags['--git-source-policy'];
  const deploymentSourcePolicyFlag = flags['--deployment-source-policy'];
  const yes = Boolean(flags['--yes']);

  telemetry.trackCliArgumentTeamSlug(teamSlugArg);
  telemetry.trackCliOptionName(nameFlag);
  telemetry.trackCliOptionSlug(slugFlag);
  telemetry.trackCliOptionPreviewSuffix(previewSuffixFlag);
  telemetry.trackCliOptionToolbar(toolbarFlag);
  telemetry.trackCliOptionDefaultBuildMachine(buildMachineFlag);
  telemetry.trackCliOptionRequireVerifiedCommits(verifiedCommitsFlag);
  telemetry.trackCliOptionSensitiveEnvPolicy(sensitiveEnvPolicyFlag);
  telemetry.trackCliOptionIpVisibility(ipVisibilityFlag);
  telemetry.trackCliOptionGitSourcePolicy(gitSourcePolicyFlag);
  telemetry.trackCliOptionDeploymentSourcePolicy(deploymentSourcePolicyFlag);
  telemetry.trackCliFlagYes(yes);

  if (args.length > 1) {
    const msg = `Too many arguments. Usage: ${getCommandName(
      'teams update [team-slug]'
    )}`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        { status: 'error', reason: 'invalid_arguments', message: msg },
        1
      );
    }
    output.error(msg);
    return 1;
  }

  // Build the sparse PATCH payload, validating every value locally before any
  // remote call. `changes` mirrors the payload for the human result block.
  const payload: TeamUpdatePayload = {};
  const changes: Array<[string, string]> = [];

  if (nameFlag !== undefined) {
    const name = nameFlag.trim();
    if (!name) {
      return invalidValue(
        client,
        'invalid_name',
        `Invalid ${param('--name')}: value cannot be empty`
      );
    }
    payload.name = name;
    changes.push(['Name', name]);
  }

  if (slugFlag !== undefined) {
    const slug = slugFlag.trim().toLowerCase();
    if (!validateSlug(slug)) {
      return invalidValue(
        client,
        'invalid_slug',
        `Invalid ${param('--slug')}: must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores (e.g. ${param('acme')})`
      );
    }
    payload.slug = slug;
    changes.push(['Slug', slug]);
  }

  if (previewSuffixFlag !== undefined) {
    const suffix = previewSuffixFlag.trim();
    payload.previewDeploymentSuffix = suffix === '' ? null : suffix;
    changes.push(['Preview Suffix', suffix === '' ? '(cleared)' : suffix]);
  }

  if (toolbarFlag !== undefined) {
    if (!ON_OFF_DEFAULT_VALUES.includes(toolbarFlag as (typeof ON_OFF_DEFAULT_VALUES)[number])) {
      return invalidValue(
        client,
        'invalid_toolbar',
        `Invalid ${param('--toolbar')}: must be one of ${ON_OFF_DEFAULT_VALUES.join(', ')}`
      );
    }
    payload.enablePreviewFeedback = toolbarFlag;
    changes.push(['Toolbar', toolbarFlag]);
  }

  if (buildMachineFlag !== undefined) {
    if (
      !BUILD_MACHINE_VALUES.includes(
        buildMachineFlag as (typeof BUILD_MACHINE_VALUES)[number]
      )
    ) {
      return invalidValue(
        client,
        'invalid_default_build_machine',
        `Invalid ${param('--default-build-machine')}: must be one of ${BUILD_MACHINE_VALUES.join(', ')}`
      );
    }
    payload.resourceConfig = { buildMachine: { default: buildMachineFlag } };
    changes.push(['Build Machine', buildMachineFlag]);
  }

  if (verifiedCommitsFlag !== undefined) {
    if (!ON_OFF_VALUES.includes(verifiedCommitsFlag as OnOff)) {
      return invalidValue(
        client,
        'invalid_require_verified_commits',
        `Invalid ${param('--require-verified-commits')}: must be one of ${ON_OFF_VALUES.join(', ')}`
      );
    }
    payload.requireVerifiedCommits = verifiedCommitsFlag === 'on';
    changes.push(['Verified Commits', verifiedCommitsFlag]);
  }

  if (sensitiveEnvPolicyFlag !== undefined) {
    if (!ON_OFF_DEFAULT_VALUES.includes(sensitiveEnvPolicyFlag as (typeof ON_OFF_DEFAULT_VALUES)[number])) {
      return invalidValue(
        client,
        'invalid_sensitive_env_policy',
        `Invalid ${param('--sensitive-env-policy')}: must be one of ${ON_OFF_DEFAULT_VALUES.join(', ')}`
      );
    }
    payload.sensitiveEnvironmentVariablePolicy = sensitiveEnvPolicyFlag;
    changes.push(['Sensitive Env Policy', sensitiveEnvPolicyFlag]);
  }

  if (ipVisibilityFlag !== undefined) {
    if (!ON_OFF_VALUES.includes(ipVisibilityFlag as OnOff)) {
      return invalidValue(
        client,
        'invalid_ip_visibility',
        `Invalid ${param('--ip-visibility')}: must be one of ${ON_OFF_VALUES.join(', ')}`
      );
    }
    // The API field is inverted: `hideIpAddresses: true` hides them.
    payload.hideIpAddresses = ipVisibilityFlag === 'off';
    changes.push(['IP Visibility', ipVisibilityFlag]);
  }

  if (gitSourcePolicyFlag !== undefined) {
    const rules = parsePolicyRules(gitSourcePolicyFlag);
    if (rules === INVALID_POLICY) {
      return invalidValue(
        client,
        'invalid_git_source_policy',
        `Invalid ${param('--git-source-policy')}: must be a JSON array of rules (each with enabled, environments, and sources) or null`
      );
    }
    payload.deploymentPolicy = {
      ...payload.deploymentPolicy,
      gitSources: rules,
    };
    changes.push([
      'Git Sources',
      rules === null ? '(cleared)' : `${rules.length} rule${rules.length === 1 ? '' : 's'}`,
    ]);
  }

  if (deploymentSourcePolicyFlag !== undefined) {
    const rules = parsePolicyRules(deploymentSourcePolicyFlag);
    if (rules === INVALID_POLICY) {
      return invalidValue(
        client,
        'invalid_deployment_source_policy',
        `Invalid ${param('--deployment-source-policy')}: must be a JSON array of rules (each with enabled, environments, and sources) or null`
      );
    }
    payload.deploymentPolicy = {
      ...payload.deploymentPolicy,
      deploymentSources: rules,
    };
    changes.push([
      'Deploy Sources',
      rules === null ? '(cleared)' : `${rules.length} rule${rules.length === 1 ? '' : 's'}`,
    ]);
  }

  if (Object.keys(payload).length === 0) {
    const msg = `No settings to update. Provide at least one option, e.g. ${param('--name')}. See ${getCommandName('teams update --help')}.`;
    if (client.nonInteractive) {
      outputAgentError(
        client,
        { status: 'error', reason: 'missing_arguments', message: msg },
        1
      );
    }
    output.error(msg);
    return 1;
  }

  // Resolve the target team: the positional slug when provided, otherwise the
  // currently selected scope's team.
  const team = await resolveTeam(client, teamSlugArg);
  if (!team) {
    return 1;
  }

  // Changing the slug changes the team URL, so confirm it explicitly.
  if (payload.slug !== undefined && payload.slug !== team.slug) {
    if (client.nonInteractive) {
      if (!yes) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'confirmation_required',
            action: 'confirmation_required',
            message: `Changing the team URL from ${team.slug} to ${payload.slug} requires confirmation. Re-run with --yes.`,
            userActionRequired: true,
            next: [{ command: buildCommandWithYes(client.argv) }],
          },
          1
        );
        output.error(
          `Confirmation required to change the team URL. Re-run with ${param('--yes')}.`
        );
        return 1;
      }
    } else if (!yes) {
      const confirmed = await client.input.confirm(
        `Change the team URL from ${chalk.bold(
          `vercel.com/${team.slug}`
        )} to ${chalk.bold(`vercel.com/${payload.slug}`)}?`,
        false
      );
      if (!confirmed) {
        output.log('Canceled. No changes made.');
        return 0;
      }
    }
  }

  output.spinner(`Updating team ${chalk.bold(team.slug)}`);
  let updated: Team;
  try {
    updated = await updateTeam(client, team.id, payload);
  } catch (err: unknown) {
    output.stopSpinner();
    return handleUpdateError(client, err);
  }
  output.stopSpinner();

  const slug = updated.slug ?? team.slug;
  printAlignedLabel('Updated', `${updated.name} (${slug})`, { gutter: '✓' });
  for (const [label, value] of changes) {
    printAlignedLabel(label, value);
  }

  return 0;
}

function invalidValue(
  client: Client,
  reason: string,
  message: string
): number {
  // `message` may contain ANSI from param(); strip it for the JSON payload.
  const plain = stripAnsi(message);
  if (client.nonInteractive) {
    outputAgentError(client, { status: 'error', reason, message: plain }, 1);
  }
  output.error(message);
  return 1;
}

async function resolveTeam(
  client: Client,
  teamSlugArg: string | undefined
): Promise<Team | null> {
  if (teamSlugArg) {
    const teams = await getTeams(client);
    const match = teams.find(team => team.slug === teamSlugArg);
    if (!match) {
      const msg = `You do not have access to a team with the slug "${teamSlugArg}".`;
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'scope_not_accessible',
            message: msg,
            next: [{ command: withGlobalFlags(client, 'teams list') }],
          },
          1
        );
      }
      output.error(msg);
      output.log(`Run ${getCommandName('teams list')} to see your teams.`);
      return null;
    }
    return match;
  }

  const { team } = await getScope(client);
  if (!team) {
    const msg =
      'No team is selected. Pass a team slug or run `vercel teams switch`.';
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_scope',
          message: msg,
          next: [{ command: withGlobalFlags(client, 'teams list') }],
        },
        1
      );
    }
    output.error(msg);
    return null;
  }
  return team;
}

function handleUpdateError(client: Client, err: unknown): number {
  if (isAPIError(err)) {
    const message = err.serverMessage || err.message || 'Failed to update team.';
    if (client.nonInteractive) {
      const reason =
        err.status === 403
          ? 'permission_denied'
          : err.status === 400
            ? 'invalid_arguments'
            : 'api_error';
      outputAgentError(client, { status: 'error', reason, message }, 1);
    }
    output.error(message);
    return 1;
  }
  printError(err);
  return 1;
}
