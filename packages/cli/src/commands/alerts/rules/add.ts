import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import { rulesAddSubcommand } from './command';
import { printRuleMutationReceipt } from './format';
import {
  resolveRulesProject,
  resolveRulesTeam,
  type AlertsScope,
} from './parse-scope';
import type { AlertRuleEnvelope, PublicAlertRuleType } from './types';
import {
  emitRulesArgParseError,
  getBodyType,
  handleRulesApiError,
  outputRulesError,
  readRuleBody,
  rulesCollectionPath,
} from './util';

interface AddFlags {
  '--project'?: string;
  '--all'?: boolean;
  '--body'?: string;
  '--format'?: string;
  '--json'?: boolean;
}

function applyScopeFlag(
  client: Client,
  body: JSONObject,
  type: PublicAlertRuleType,
  scope: AlertsScope,
  flags: AddFlags,
  jsonOutput: boolean
): number | undefined {
  if (Object.hasOwn(body, 'ruleScope')) {
    if (flags['--project'] || flags['--all']) {
      return outputRulesError(
        client,
        jsonOutput,
        'SCOPE_CONFLICT',
        'Specify rule scope either in the body or with --project/--all, not both.'
      );
    }
    return undefined;
  }

  if (flags['--project']) {
    body.ruleScope =
      type === 'custom'
        ? { type: 'project', projectId: scope.projectId! }
        : { type: 'include', projectIds: [scope.projectId!] };
    return undefined;
  }

  if (flags['--all']) {
    if (type === 'custom') {
      return outputRulesError(
        client,
        jsonOutput,
        'INVALID_SCOPE',
        'Custom alert rules must target one project. Use --project <name-or-id>.'
      );
    }
    body.ruleScope = { type: 'all' };
    return undefined;
  }

  return outputRulesError(
    client,
    jsonOutput,
    'MISSING_SCOPE',
    'Missing rule scope. Add ruleScope to the body, or pass --project or --all.'
  );
}

async function resolveCreateScope(
  client: Client,
  flags: AddFlags,
  jsonOutput: boolean
): Promise<AlertsScope | number> {
  if (flags['--project'] && flags['--all']) {
    return outputRulesError(
      client,
      jsonOutput,
      'MUTUAL_EXCLUSIVITY',
      'Cannot specify both --all and --project. Use one or the other.'
    );
  }
  return flags['--project']
    ? resolveRulesProject(
        client,
        flags['--project'],
        jsonOutput,
        'alerts rules add'
      )
    : resolveRulesTeam(client, jsonOutput);
}

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
  } catch (error) {
    emitRulesArgParseError(
      client,
      error,
      'alerts rules add --project <name-or-id> --body <path>'
    );
    printError(error);
    return 1;
  }

  const flags = parsedArgs.flags as AddFlags;
  const format = validateJsonOutput(flags);
  if (!format.valid) {
    return outputRulesError(client, false, 'INVALID_ARGUMENTS', format.error);
  }

  if (!flags['--body']) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'MISSING_ARGUMENTS',
      'Missing required flag: --body <PATH>.'
    );
  }

  const body = readRuleBody(client, flags['--body'], format.jsonOutput);
  if (typeof body === 'number') return body;

  const type = getBodyType(body);
  if (!type) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'INVALID_RULE_TYPE',
      'Create body must set type to built-in or custom.'
    );
  }

  if (
    Object.hasOwn(body, 'ruleScope') &&
    (flags['--project'] || flags['--all'])
  ) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'SCOPE_CONFLICT',
      'Specify rule scope either in the body or with --project/--all, not both.'
    );
  }

  if (type === 'custom' && flags['--all']) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'INVALID_SCOPE',
      'Custom alert rules must target one project. Use --project <name-or-id>.'
    );
  }

  const scope = await resolveCreateScope(client, flags, format.jsonOutput);
  if (typeof scope === 'number') return scope;

  const scopeError = applyScopeFlag(
    client,
    body,
    type,
    scope,
    flags,
    format.jsonOutput
  );
  if (scopeError !== undefined) return scopeError;

  output.spinner('Creating alert rule…');
  try {
    const response = await client.fetch<AlertRuleEnvelope>(
      rulesCollectionPath(scope.teamId),
      { method: 'POST', body }
    );
    if (format.jsonOutput) {
      client.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    } else {
      printRuleMutationReceipt('Created', response.rule, client.argv);
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
