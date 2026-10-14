import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { isAPIError } from '../../util/errors-ts';
import { packageName } from '../../util/pkg-name';
import { monitorsInspectSubcommand } from './command';
import { printRule } from './format';
import { resolveRulesTeam } from './parse-scope';
import {
  emitRulesArgParseError,
  fetchRule,
  handleRulesApiError,
  outputRulesError,
} from './util';

export default async function inspectRule(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(monitorsInspectSubcommand.options)
    );
  } catch (error) {
    emitRulesArgParseError(client, error, 'monitors inspect <monitor-id>');
    printError(error);
    return 1;
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
      `Missing monitor ID. Example: ${packageName} monitors inspect <monitor-id>`
    );
  }

  const scope = await resolveRulesTeam(client, format.jsonOutput);
  if (typeof scope === 'number') return scope;

  output.spinner('Fetching monitor…');
  try {
    const rule = await fetchRule(client, scope, ruleId);
    if (format.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ rule }, null, 2)}\n`);
    } else {
      printRule(rule);
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
