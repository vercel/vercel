import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import output from '../../../output-manager';
import { validateJsonOutput } from '../../../util/output-format';
import { isAPIError } from '../../../util/errors-ts';
import { packageName } from '../../../util/pkg-name';
import { rulesUpdateSubcommand } from './command';
import { printRuleMutationReceipt } from './format';
import {
  resolveRulesProject,
  resolveRulesTeam,
  type AlertsScope,
} from './parse-scope';
import type {
  AlertRuleEnvelope,
  PublicAlertRule,
  PublicAlertRuleType,
} from './types';
import {
  emitRulesArgParseError,
  fetchRule,
  handleRulesApiError,
  outputRulesError,
  readRuleBody,
  rulesItemPath,
} from './util';

interface UpdateFlags {
  '--project'?: string;
  '--all'?: boolean;
  '--body'?: string;
  '--format'?: string;
  '--json'?: boolean;
}

function sameScope(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scopeForRule(
  client: Client,
  type: PublicAlertRuleType,
  scope: AlertsScope,
  flags: UpdateFlags,
  jsonOutput: boolean
): JSONObject | number {
  if (flags['--project']) {
    return type === 'custom'
      ? { type: 'project', projectId: scope.projectId! }
      : { type: 'include', projectIds: [scope.projectId!] };
  }
  if (type === 'custom') {
    return outputRulesError(
      client,
      jsonOutput,
      'INVALID_SCOPE',
      'Custom alert rules must target one project. Use --project <name-or-id>.'
    );
  }
  return { type: 'all' };
}

async function resolveUpdateScope(
  client: Client,
  flags: UpdateFlags,
  jsonOutput: boolean,
  ruleId: string
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
        `alerts rules update ${ruleId}`
      )
    : resolveRulesTeam(client, jsonOutput);
}

function writeRuleResult(
  client: Client,
  jsonOutput: boolean,
  action: 'Updated' | 'Unchanged',
  rule: PublicAlertRule
): void {
  if (jsonOutput) {
    client.stdout.write(`${JSON.stringify({ rule }, null, 2)}\n`);
  } else {
    printRuleMutationReceipt(action, rule, client.argv);
  }
}

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
  } catch (error) {
    emitRulesArgParseError(
      client,
      error,
      'alerts rules update <rule-id> --project <name-or-id>'
    );
    printError(error);
    return 1;
  }

  const flags = parsedArgs.flags as UpdateFlags;
  const format = validateJsonOutput(flags);
  if (!format.valid) {
    return outputRulesError(client, false, 'INVALID_ARGUMENTS', format.error);
  }

  const ruleId = parsedArgs.args[0];
  if (!ruleId) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'MISSING_ARGUMENTS',
      `Missing rule ID. Example: ${packageName} alerts rules update <rule-id> --body <file>`
    );
  }

  const hasScopeFlag = Boolean(flags['--project'] || flags['--all']);
  if (!flags['--body'] && !hasScopeFlag) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'MISSING_ARGUMENTS',
      'Provide --body <PATH>, --project <name-or-id>, or --all.'
    );
  }

  const body = flags['--body']
    ? readRuleBody(client, flags['--body'], format.jsonOutput)
    : ({} as JSONObject);
  if (typeof body === 'number') return body;

  if (
    Object.hasOwn(body, 'type') &&
    body.type !== 'built-in' &&
    body.type !== 'custom'
  ) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'INVALID_RULE_TYPE',
      'When provided, update body type must be built-in or custom.'
    );
  }
  if (hasScopeFlag && Object.hasOwn(body, 'ruleScope')) {
    return outputRulesError(
      client,
      format.jsonOutput,
      'SCOPE_CONFLICT',
      'Specify rule scope either in the body or with --project/--all, not both.'
    );
  }

  const scope = await resolveUpdateScope(
    client,
    flags,
    format.jsonOutput,
    ruleId
  );
  if (typeof scope === 'number') return scope;

  try {
    let existing: PublicAlertRule | undefined;
    if (hasScopeFlag) {
      output.spinner('Fetching alert rule…');
      existing = await fetchRule(client, scope, ruleId);
      const desiredScope = scopeForRule(
        client,
        existing.type,
        scope,
        flags,
        format.jsonOutput
      );
      if (typeof desiredScope === 'number') return desiredScope;

      if (!sameScope(existing.ruleScope, desiredScope)) {
        body.ruleScope = desiredScope;
      } else if (Object.keys(body).length === 0) {
        output.stopSpinner();
        writeRuleResult(client, format.jsonOutput, 'Unchanged', existing);
        return 0;
      }
    }

    output.spinner('Updating alert rule…');
    const response = await client.fetch<AlertRuleEnvelope>(
      rulesItemPath(scope.teamId, ruleId),
      { method: 'PATCH', body }
    );
    writeRuleResult(client, format.jsonOutput, 'Updated', response.rule);
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
