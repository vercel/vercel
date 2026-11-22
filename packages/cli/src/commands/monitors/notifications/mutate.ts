import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import { packageName } from '../../../util/pkg-name';
import { AGENT_STATUS } from '../../../util/agent-output-constants';
import {
  monitorsNotificationsLinkSubcommand,
  monitorsNotificationsUpdateSubcommand,
  monitorsNotificationsUnlinkSubcommand,
} from '../command';
import { resolveRulesTeam } from '../parse-scope';
import type {
  AlertRuleNotificationMutation,
  AlertRuleNotificationMutationEnvelope,
  AlertRuleNotificationTarget,
  MonitorsApi,
} from '../types';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  outputRulesError,
  rulesNotificationLinksPath,
} from '../util';
import {
  buildRuleNotificationsInspectCommand,
  printRuleNotificationMutationReceipt,
} from './format';

interface MutationFlags {
  '--webhook'?: string;
  '--slack-channel'?: string;
  '--slack-installation-id'?: string;
  '--critical-only'?: boolean;
  '--no-critical-only'?: boolean;
  '--format'?: string;
  '--json'?: boolean;
}

const API_SLACK_INSTALLATION_REQUIRED_MESSAGE =
  'configId is required unless the team has exactly one Slack configuration.';

const CLI_SLACK_INSTALLATION_REQUIRED_MESSAGE =
  'A Slack installation ID is required unless the team has exactly one completed Slack installation. Pass --slack-installation-id <installation-id>.';

function getTarget(
  client: Client,
  flags: MutationFlags,
  jsonOutput: boolean
): AlertRuleNotificationTarget | number {
  const webhookId = flags['--webhook'];
  const channelId = flags['--slack-channel'];
  const configId = flags['--slack-installation-id'];

  if (webhookId && (channelId || configId)) {
    return outputRulesError(
      client,
      jsonOutput,
      'INVALID_ARGUMENTS',
      'Specify either --webhook or --slack-channel, not both.'
    );
  }
  if (configId && !channelId) {
    return outputRulesError(
      client,
      jsonOutput,
      'INVALID_ARGUMENTS',
      '--slack-installation-id requires --slack-channel.'
    );
  }
  if (webhookId) return { type: 'webhook', webhookId };
  if (channelId) {
    return configId
      ? { type: 'slack', channelId, configId }
      : { type: 'slack', channelId };
  }
  return outputRulesError(
    client,
    jsonOutput,
    'MISSING_ARGUMENTS',
    'Specify a notification destination with --webhook or --slack-channel.'
  );
}

function applyDeliverySetting(
  client: Client,
  target: AlertRuleNotificationTarget,
  flags: MutationFlags,
  action: NotificationMutationAction,
  jsonOutput: boolean
): AlertRuleNotificationMutation | number {
  const criticalOnly = flags['--critical-only'];
  const noCriticalOnly = flags['--no-critical-only'];

  if (criticalOnly && noCriticalOnly) {
    return outputRulesError(
      client,
      jsonOutput,
      'MUTUAL_EXCLUSIVITY',
      'Specify either --critical-only or --no-critical-only, not both.'
    );
  }
  if (action === 'update' && !criticalOnly && !noCriticalOnly) {
    return outputRulesError(
      client,
      jsonOutput,
      'MISSING_ARGUMENTS',
      'Specify --critical-only or --no-critical-only.'
    );
  }
  if (criticalOnly) {
    return { ...target, minimumSeverityLevel: 'critical' };
  }
  if (action === 'update' && noCriticalOnly) {
    return { ...target, minimumSeverityLevel: null };
  }
  return target;
}

type NotificationMutationAction = 'link' | 'update' | 'unlink';

export default async function mutate(
  client: Client,
  argv: string[],
  api: MonitorsApi,
  action: NotificationMutationAction
): Promise<number> {
  const command = {
    link: monitorsNotificationsLinkSubcommand,
    update: monitorsNotificationsUpdateSubcommand,
    unlink: monitorsNotificationsUnlinkSubcommand,
  }[action];
  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, getFlagsSpecification(command.options));
  } catch (error) {
    emitRulesArgParseError(
      client,
      error,
      `monitors notifications ${action} <monitor-id> --webhook <webhook-id>`
    );
    printError(error);
    return 2;
  }

  const flags = parsedArgs.flags as MutationFlags;
  const format = validateJsonOutput(flags);
  if (!format.valid) {
    return outputRulesError(client, false, 'INVALID_ARGUMENTS', format.error);
  }

  const [ruleId, extraArg] = parsedArgs.args;
  if (!ruleId) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'MISSING_ARGUMENTS',
      `Missing monitor ID. Example: ${packageName} monitors notifications ${action} <monitor-id> --webhook <webhook-id>`
    );
  }
  if (extraArg) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'INVALID_ARGUMENTS',
      'Expected exactly one monitor ID.'
    );
  }

  const target = getTarget(client, flags, format.jsonOutput);
  if (typeof target === 'number') return target;
  const notification = applyDeliverySetting(
    client,
    target,
    flags,
    action,
    format.jsonOutput
  );
  if (typeof notification === 'number') return notification;

  const scope = await resolveRulesTeam(client, format.jsonOutput);
  if (typeof scope === 'number') return scope;

  if (!client.nonInteractive) {
    output.spinner(
      `${action === 'link' ? 'Linking' : action === 'update' ? 'Updating' : 'Unlinking'} notification destination…`
    );
  }
  try {
    const response = await client.fetch<AlertRuleNotificationMutationEnvelope>(
      rulesNotificationLinksPath(api, scope.teamId, ruleId),
      {
        method:
          action === 'link' ? 'POST' : action === 'update' ? 'PATCH' : 'DELETE',
        body: notification,
      }
    );
    if (client.nonInteractive) {
      const actionPastTense =
        action === 'link'
          ? 'Linked'
          : action === 'update'
            ? 'Updated'
            : 'Unlinked';
      const preposition =
        action === 'link' ? 'to' : action === 'update' ? 'for' : 'from';
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.OK,
            success: response.success,
            action,
            [api.idKey]: ruleId,
            notification: response.notification,
            message: `${actionPastTense} notification destination ${preposition} monitor ${ruleId}.`,
            next: [
              {
                command: buildRuleNotificationsInspectCommand(
                  client.argv,
                  ruleId
                ),
                when: 'Inspect linked notification destinations',
              },
            ],
          },
          null,
          2
        )}\n`
      );
    } else if (format.jsonOutput) {
      client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    } else {
      printRuleNotificationMutationReceipt(
        action === 'link'
          ? 'Linked'
          : action === 'update'
            ? 'Updated'
            : 'Unlinked',
        ruleId,
        notification,
        client.argv
      );
    }
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      if (error.serverMessage === API_SLACK_INSTALLATION_REQUIRED_MESSAGE) {
        return outputRulesError(
          client,
          format.jsonOutput,
          error.code || 'bad_request',
          CLI_SLACK_INSTALLATION_REQUIRED_MESSAGE
        );
      }
      return handleRulesApiError(client, error, format.jsonOutput);
    }
    throw error;
  } finally {
    if (!client.nonInteractive) {
      output.stopSpinner();
    }
  }
}
