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
import { rulesAddSubcommand } from './command';
import { parseRulesFlagsAndScope } from './parse-scope';
import {
  emitRulesArgParseError,
  handleRulesApiError,
  rulesCollectionPath,
} from './util';

export default async function add(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesAddSubcommand.options)
    );
  } catch (e) {
    emitRulesArgParseError(
      client,
      e,
      'alerts rules add --project <name-or-id> --body <path>'
    );
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

  const bodyPath = parsedArgs.flags['--body'] as string | undefined;
  if (!bodyPath) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: `Missing required flag --body. Example: ${packageName} alerts rules add --body <file>`,
        hint: 'Provide a JSON file describing the new rule (id and teamId are assigned by the API).',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'alerts rules add --body <file>'
            ),
            when: 'Replace <file> with a path to rule JSON',
          },
        ],
      },
      1
    );
    output.error(
      'Missing required flag: --body <PATH> (JSON file for the new rule).'
    );
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

  // List with a linked project filters by `projectId`; the API POST only
  // persisted the JSON body, so attach scope project when the body omits it.
  if (scope.projectId !== undefined && body.projectId === undefined) {
    body.projectId = scope.projectId;
  }

  const path = rulesCollectionPath(scope);
  output.spinner('Creating alert rule...');
  try {
    const created = await client.fetch<JSONObject>(path, {
      method: 'POST',
      body,
    });
    if (fr.jsonOutput) {
      client.stdout.write(`${JSON.stringify({ rule: created }, null, 2)}\n`);
    } else {
      const id = created?.id;
      output.success(`Created alert rule ${typeof id === 'string' ? id : ''}`);
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
