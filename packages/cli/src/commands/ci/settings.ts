import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { getCommandNamePlain } from '../../util/pkg-name';
import { buildCiCommand, ciDisplayText } from '../../util/ci/output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import {
  getCiRepositorySettings,
  updateCiRepositorySettings,
  type CiRepositoryRef,
  type CiRepositorySettings,
} from '../../util/ci/api';
import { CiEnableTelemetryClient } from '../../util/telemetry/commands/ci/enable';
import { CiDisableTelemetryClient } from '../../util/telemetry/commands/ci/disable';
import { disableSubcommand, enableSubcommand } from './command';
import { resolveCiContext } from './context';
import { failCi, invalidCiArguments } from './errors';

export default async function updateSettings(
  client: Client,
  argv: string[],
  action: 'enable' | 'disable'
): Promise<number> {
  const enabled = action === 'enable';
  const command = enabled ? enableSubcommand : disableSubcommand;
  const Telemetry = enabled
    ? CiEnableTelemetryClient
    : CiDisableTelemetryClient;
  const telemetry = new Telemetry({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, getFlagsSpecification(command.options));
  } catch (error) {
    printError(error, client);
    return 2;
  }
  const { args, flags } = parsedArgs;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionRemote(flags['--remote']);

  if (args.length > 0) {
    return invalidCiArguments(
      client,
      `\`${getCommandNamePlain(`ci ${action}`)}\` doesn't take arguments. Run it inside the repository to ${action}.`
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidCiArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const context = await resolveCiContext(client, {
    remote: flags['--remote'],
    nonInteractive: asJson,
    action,
  });
  if (typeof context === 'number') {
    return context;
  }
  const { git, accountId } = context;

  const [organizationId, repository] = git.repository.split('/');
  const repo: CiRepositoryRef = {
    provider: git.provider,
    organizationId,
    repository,
  };
  const repoName = ciDisplayText(git.repository);

  if (!asJson) {
    output.spinner(enabled ? 'Enabling Vercel CI…' : 'Disabling Vercel CI…');
  }

  let settings: CiRepositorySettings;
  let outcome: 'enabled' | 'disabled' | 'unchanged';
  try {
    const current = await getCiRepositorySettings(client, repo, accountId);
    if (current.ciEnabled === enabled) {
      settings = current;
      outcome = 'unchanged';
    } else {
      settings = await updateCiRepositorySettings(
        client,
        repo,
        { ciEnabled: enabled },
        accountId
      );
      outcome = enabled ? 'enabled' : 'disabled';
    }
  } catch (err) {
    output.stopSpinner();
    return handleSettingsError(client, repoName, action, err);
  }
  output.stopSpinner();

  const listCommand = buildCiCommand(client.argv, ['ci', 'list']);
  // Other CI commands currently resolve origin, so don't suggest a command
  // that would inspect a different repository than the one just enabled.
  const next =
    enabled && context.remoteName === 'origin'
      ? [
          {
            command: listCommand,
            when: 'List Vercel CI runs after you push a commit',
          },
        ]
      : [];
  const state = enabled ? 'enabled' : 'disabled';
  const verb = enabled ? 'Enabled' : 'Disabled';
  const message =
    outcome === 'unchanged'
      ? `Vercel CI is already ${state} for ${repoName}.`
      : `${verb} Vercel CI for ${repoName}.`;

  if (asJson) {
    const payload = {
      repository: settings,
      outcome,
      next,
    };
    const agentPayload = client.nonInteractive
      ? { status: AGENT_STATUS.OK, ...payload, message }
      : payload;
    client.stdout.write(`${JSON.stringify(agentPayload, null, 2)}\n`);
    return 0;
  }

  if (outcome !== 'unchanged') {
    printAlignedLabel(verb, 'Vercel CI', { gutter: '✓' });
    printAlignedLabel('Repository', repoName);
  } else {
    output.print(`  ${message}\n`);
  }
  if (next.length > 0) {
    output.print(`\n  ${next[0].when}:\n  ${listCommand}\n`);
  }
  return 0;
}

function handleSettingsError(
  client: Client,
  repoName: string,
  action: 'enable' | 'disable',
  err: unknown
): number {
  if (!isAPIError(err)) {
    throw err;
  }
  switch (err.status) {
    case 403:
      return failCi(client, {
        reason: AGENT_REASON.PERMISSION_DENIED,
        message: `Can't ${action} Vercel CI for ${repoName}. You don't have permission to change Vercel CI settings for this team.`,
      });
    case 404:
      return failCi(client, {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Couldn't find ${repoName} connected to a project on this team. Connect the repository to a project, or pass the team that owns it with --scope.`,
        next: [
          {
            command: buildCiCommand(client.argv, ['git', 'connect']),
            when: 'Connect the linked project to this repository',
          },
        ],
      });
    case 409:
      return failCi(client, {
        reason: AGENT_REASON.CONFLICT,
        message:
          err.code === 'repository_linked_to_multiple_teams'
            ? `Can't ${action} Vercel CI for ${repoName}. It's connected to projects on more than one team; Vercel CI needs it connected to one team only.`
            : `Can't ${action} Vercel CI for ${repoName}. More than one connected repository matches it on this team.`,
      });
    case 429:
      return failCi(client, {
        reason: AGENT_REASON.RATE_LIMITED,
        message: `Failed to ${action} Vercel CI for ${repoName}. Too many requests. Wait a moment, then try again.`,
      });
    default:
      return failCi(client, {
        reason: AGENT_REASON.API_ERROR,
        message: `Failed to ${action} Vercel CI for ${repoName} (HTTP ${err.status}). ${action === 'enable' ? 'Enabling' : 'Disabling'} is safe to repeat, so run the command again.`,
      });
  }
}
