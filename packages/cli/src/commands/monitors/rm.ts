import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import { monitorsRmSubcommand } from './command';
import {
  printRuleDeletionReceipt,
  printRuleMutationReceipt,
  printRulePreview,
} from './format';
import { resolveRulesTeam } from './parse-scope';
import type { MonitorsApi, PublicAlertRule } from './types';
import {
  emitRulesArgParseError,
  fetchRule,
  handleRulesApiError,
  outputRulesError,
  rulesItemPath,
} from './util';

export default async function rm(
  client: Client,
  argv: string[],
  api: MonitorsApi
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(monitorsRmSubcommand.options)
    );
  } catch (error) {
    emitRulesArgParseError(client, error, 'monitors remove <monitor-id> --yes');
    printError(error);
    return 2;
  }

  const format = validateJsonOutput(parsedArgs.flags);
  if (!format.valid) {
    return outputRulesError(client, false, 'INVALID_ARGUMENTS', format.error);
  }

  const ruleId = parsedArgs.args[0];
  if (!ruleId) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'MISSING_ARGUMENTS',
      `Missing monitor ID. Example: ${packageName} monitors remove <monitor-id> --yes`
    );
  }

  const scope = await resolveRulesTeam(client, format.jsonOutput);
  if (typeof scope === 'number') return scope;

  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);
  let prefetchedRule: PublicAlertRule | undefined;
  try {
    if (!skipConfirmation) {
      output.spinner('Fetching monitor…');
      prefetchedRule = await fetchRule(client, api, scope, ruleId);
      output.stopSpinner();
      printRulePreview(prefetchedRule);
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.CONFIRMATION_REQUIRED,
          message:
            'Removing a monitor requires confirmation. Re-run with --yes.',
          next: [{ command: buildCommandWithYes(client.argv) }],
        },
        1
      );
      if (
        !(await client.input.confirm(
          `Remove monitor ${prefetchedRule.name} (${ruleId})? This cannot be undone.`,
          false
        ))
      ) {
        output.log('Canceled');
        return 0;
      }
    }

    output.spinner('Removing monitor…');
    await client.fetch(rulesItemPath(api, scope.teamId, ruleId), {
      method: 'DELETE',
    });
    if (format.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ ok: true, [api.idKey]: ruleId, deleted: true }, null, 2)}\n`
      );
    } else if (prefetchedRule) {
      printRuleMutationReceipt('Removed', prefetchedRule, client.argv);
    } else {
      printRuleDeletionReceipt(ruleId);
    }
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      return handleRulesApiError(client, error, format.jsonOutput);
    }
    throw error;
  } finally {
    output.stopSpinner();
  }
}
