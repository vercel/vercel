import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import {
  buildCommandWithGlobalFlags,
  buildCommandWithYes,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { packageName } from '../../../util/pkg-name';
import { rulesRmSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  rulesItemPath,
} from './util';

export default async function rm(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesRmSubcommand.options)
    );
  } catch (e) {
    emitRulesArgParseError(
      client,
      e,
      'alerts rules rm <ruleId> --project <name-or-id> --yes'
    );
    printError(e);
    return 1;
  }

  const ruleId = parsedArgs.args[0];
  const fr = validateJsonOutput(parsedArgs.flags);
  if (!fr.valid) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: fr.error,
      },
      1
    );
    output.error(fr.error);
    return 1;
  }

  if (!ruleId) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing rule id. Example: ${packageName} alerts rules rm <ruleId> --yes`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules rm <ruleId> --yes'
            ),
            when: 'Replace <ruleId> with an id from `alerts rules ls`',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules ls'
            ),
            when: 'List rule ids in the current scope',
          },
        ],
      },
      1
    );
    output.error('Usage: `vercel alerts rules rm <ruleId>`');
    return 1;
  }

  const skipConfirmation = Boolean(parsedArgs.flags['--yes']);

  const scope = await parseRulesFlagsAndScope(
    client,
    {
      '--project': parsedArgs.flags['--project'] as string | undefined,
      '--all': parsedArgs.flags['--all'] as boolean | undefined,
    },
    fr.jsonOutput
  );
  if (typeof scope === 'number') {
    return scope;
  }

  if (!skipConfirmation) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message:
          'Removing an alert rule requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
    if (
      !(await client.input.confirm(
        `Delete alert rule ${ruleId}? This cannot be undone.`,
        false
      ))
    ) {
      output.log('Canceled');
      return 0;
    }
  }

  const path = rulesItemPath(scope, ruleId);
  output.spinner('Deleting alert rule...');
  try {
    await client.fetch(path, { method: 'DELETE' });
    if (fr.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ ok: true, ruleId, deleted: true }, null, 2)}\n`
      );
    } else {
      output.success(`Deleted alert rule ${ruleId}`);
    }
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      return handleRulesApiError(client, err, fr.jsonOutput);
    }
    throw err;
  } finally {
    output.stopSpinner();
  }
}
