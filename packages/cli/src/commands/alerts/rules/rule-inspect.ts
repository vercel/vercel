import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { packageName } from '../../../util/pkg-name';
import { rulesInspectSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  rulesItemPath,
} from './util';

export default async function ruleInspect(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesInspectSubcommand.options)
    );
  } catch (e) {
    emitRulesArgParseError(
      client,
      e,
      'alerts rules inspect <ruleId> --project <name-or-id>'
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
        message: `Missing rule id. Example: ${packageName} alerts rules inspect <ruleId>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules inspect <ruleId>'
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
    output.error('Usage: `vercel alerts rules inspect <ruleId>`');
    return 1;
  }

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

  const path = rulesItemPath(scope, ruleId);
  output.spinner('Fetching alert rule...');
  try {
    const rule = await client.fetch<Record<string, unknown>>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ rule }, null, 2)}\n`);
    } else {
      client.stdout.write(`${JSON.stringify(rule, null, 2)}\n`);
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
