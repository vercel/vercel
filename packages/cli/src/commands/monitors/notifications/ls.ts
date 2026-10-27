import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import { buildCommandWithGlobalFlags } from '../../../util/agent-output';
import { AGENT_STATUS } from '../../../util/agent-output-constants';
import { quoteArg } from '../../../util/flags/quote-arg';
import { monitorsNotificationsLsSubcommand } from '../command';
import { resolveRulesTeam } from '../parse-scope';
import type { AlertRuleNotificationsEnvelope, MonitorsApi } from '../types';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  outputRulesError,
  ruleNotificationsPath,
} from '../util';
import { fetchRulesNotifications } from './aggregate';
import { printRuleNotifications, printRulesNotifications } from './format';

export default async function ls(
  client: Client,
  argv: string[],
  api: MonitorsApi
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(monitorsNotificationsLsSubcommand.options)
    );
  } catch (error) {
    emitRulesArgParseError(
      client,
      error,
      'monitors notifications [monitor-id]'
    );
    printError(error);
    return 2;
  }

  const format = validateJsonOutput(parsedArgs.flags);
  if (!format.valid) {
    return outputRulesError(client, false, 'INVALID_ARGUMENTS', format.error);
  }

  const [ruleId, extraArg] = parsedArgs.args;
  if (extraArg) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'INVALID_ARGUMENTS',
      'Expected exactly one monitor ID.'
    );
  }

  const scope = await resolveRulesTeam(client, format.jsonOutput);
  if (typeof scope === 'number') return scope;

  if (!client.nonInteractive) {
    output.spinner(
      ruleId
        ? 'Fetching notification destinations…'
        : 'Fetching monitor notification destinations…'
    );
  }
  try {
    if (!ruleId) {
      const result = await fetchRulesNotifications(client, api, scope.teamId);
      if (client.nonInteractive) {
        const ruleCount = Object.keys(result.notifications).length;
        const notificationCount = Object.values(result.notifications).reduce(
          (count, notifications) => count + notifications.length,
          0
        );
        client.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.OK,
              ...result,
              message: `Listed ${notificationCount} notification destination${notificationCount === 1 ? '' : 's'} across ${ruleCount} readable monitor${ruleCount === 1 ? '' : 's'}.`,
              next: [
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'monitors notifications link <monitor-id> --slack-channel <channel-id> --slack-installation-id <installation-id>'
                  ),
                  when: 'Link a Slack channel to a monitor',
                },
                {
                  command: buildCommandWithGlobalFlags(
                    client.argv,
                    'monitors notifications link <monitor-id> --webhook <webhook-id>'
                  ),
                  when: 'Link an account webhook to a monitor',
                },
              ],
            },
            null,
            2
          )}\n`
        );
      } else if (format.jsonOutput) {
        client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        printRulesNotifications(result);
      }
      return 0;
    }

    const response = await client.fetch<AlertRuleNotificationsEnvelope>(
      ruleNotificationsPath(api, scope.teamId, ruleId)
    );
    if (client.nonInteractive) {
      const count = response.notifications.length;
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.OK,
            [api.idKey]: ruleId,
            notifications: response.notifications,
            message: `${count} notification destination${count === 1 ? '' : 's'} linked to monitor ${ruleId}.`,
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `monitors notifications link ${quoteArg(ruleId)} --webhook <webhook-id>`
                ),
                when: 'Link an account webhook',
              },
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `monitors notifications link ${quoteArg(ruleId)} --slack-channel <channel-id>`
                ),
                when: 'Link a Slack channel',
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
      printRuleNotifications(ruleId, response.notifications);
    }
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      return handleRulesApiError(client, error, format.jsonOutput);
    }
    throw error;
  } finally {
    if (!client.nonInteractive) {
      output.stopSpinner();
    }
  }
}
