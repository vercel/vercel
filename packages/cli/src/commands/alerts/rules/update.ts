import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { JSONObject } from '@vercel-internals/types';
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
import { rulesUpdateSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  rulesItemPath,
} from './util';

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesUpdateSubcommand.options)
    );
  } catch (e) {
    emitRulesArgParseError(
      client,
      e,
      'alerts rules update <ruleId> --project <name-or-id> --body <path>'
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
        message: `Missing rule id. Example: ${packageName} alerts rules update <ruleId> --body <file>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules update <ruleId> --body <file>'
            ),
            when: 'Replace <ruleId> and <file> with id and JSON patch path',
          },
        ],
      },
      1
    );
    output.error('Usage: `vercel alerts rules update <ruleId> --body <PATH>`');
    return 1;
  }

  const bodyPath = parsedArgs.flags['--body'] as string | undefined;
  if (!bodyPath) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing required flag --body. Example: ${packageName} alerts rules update ${ruleId} --body <file>`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `alerts rules update ${ruleId} --body <file>`
            ),
            when: 'Replace <file> with a path to JSON patch payload',
          },
        ],
      },
      1
    );
    output.error('Missing required flag: --body <PATH> (JSON patch payload).');
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

  let raw: string;
  try {
    raw = readFileSync(resolve(client.cwd, bodyPath), 'utf8');
  } catch {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Could not read --body file: ${bodyPath}`,
      },
      1
    );
    output.error(`Could not read --body file: ${bodyPath}`);
    return 1;
  }

  let body: JSONObject;
  try {
    body = JSON.parse(raw) as JSONObject;
  } catch {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'Invalid JSON in --body file.',
      },
      1
    );
    output.error('Invalid JSON in --body file.');
    return 1;
  }

  delete body.id;
  delete body.teamId;

  const path = rulesItemPath(scope, ruleId);
  output.spinner('Updating alert rule...');
  try {
    const updated = await client.fetch<JSONObject>(path, {
      method: 'PATCH',
      body,
    });
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ rule: updated }, null, 2)}\n`);
    } else {
      output.success(`Updated alert rule ${ruleId}`);
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
