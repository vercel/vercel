import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import { outputAgentError } from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { rulesLsSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  rulesCollectionPath,
} from './util';

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesLsSubcommand.options)
    );
  } catch (e) {
    emitRulesArgParseError(client, e, 'alerts rules ls --project <name-or-id>');
    printError(e);
    return 1;
  }

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

  const path = rulesCollectionPath(scope);
  output.spinner('Fetching alert rules...');
  try {
    const rules = await client.fetch<Record<string, unknown>[]>(path);
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ rules }, null, 2)}\n`);
    } else if (rules.length === 0) {
      output.log('No alert rules found for this scope.');
    } else {
      for (const r of rules) {
        const id = typeof r.id === 'string' ? r.id : '';
        const name = typeof r.name === 'string' ? r.name : '';
        const pid = typeof r.projectId === 'string' ? r.projectId : '';
        output.log(
          `${id}\t${name}${pid ? `\tproject: ${pid}` : '\t(team-wide)'}`
        );
      }
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
