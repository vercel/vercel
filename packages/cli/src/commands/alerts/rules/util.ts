import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../../util/client';
import { isJSONObject } from '../../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import output from '../../../output-manager';
import type { AlertsScope } from '../resolve-alerts-scope';
import type {
  AlertRuleIssue,
  AlertRuleEnvelope,
  PublicAlertRule,
  PublicAlertRuleType,
} from './types';

interface RulesCollectionOptions {
  cursor?: string;
  limit?: number;
  projectId?: string;
  type?: PublicAlertRuleType;
}

export function rulesCollectionPath(
  teamId: string,
  options: RulesCollectionOptions = {}
): string {
  const query = new URLSearchParams({ teamId });
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.projectId) query.set('projectId', options.projectId);
  if (options.type) query.set('type', options.type);
  return `/alerts/v3/alert-rules?${query.toString()}`;
}

export function rulesItemPath(teamId: string, ruleId: string): string {
  const query = new URLSearchParams({ teamId });
  return `/alerts/v3/alert-rules/${encodeURIComponent(ruleId)}?${query.toString()}`;
}

export function rulesSchemaPath(
  teamId: string,
  type?: PublicAlertRuleType
): string {
  const query = new URLSearchParams({ teamId });
  if (type) query.set('type', type);
  return `/alerts/v3/alert-rules/schema?${query.toString()}`;
}

export async function fetchRule(
  client: Client,
  scope: AlertsScope,
  ruleId: string
): Promise<PublicAlertRule> {
  const response = await client.fetch<AlertRuleEnvelope>(
    rulesItemPath(scope.teamId, ruleId)
  );
  return response.rule;
}

function getIssues(error: { issues?: unknown }): AlertRuleIssue[] {
  if (!Array.isArray(error.issues)) return [];
  return error.issues.filter(
    (issue): issue is AlertRuleIssue =>
      isJSONObject(issue) &&
      typeof issue.path === 'string' &&
      typeof issue.message === 'string'
  );
}

export function outputRulesError(
  client: Client,
  jsonOutput: boolean,
  code: string,
  message: string,
  options: {
    reason?: string;
    hint?: string;
    issues?: AlertRuleIssue[];
  } = {}
): number {
  const issues = options.issues ?? [];
  const issueSummary = issues
    .slice(0, 5)
    .map(issue => `${issue.path || 'body'}: ${issue.message}`)
    .join('; ');

  outputAgentError(
    client,
    {
      status: 'error',
      reason: options.reason ?? AGENT_REASON.INVALID_ARGUMENTS,
      message,
      hint: options.hint ?? (issueSummary || undefined),
    },
    1
  );

  if (jsonOutput) {
    client.stdout.write(
      `${JSON.stringify(
        { error: { code, message, ...(issues.length ? { issues } : {}) } },
        null,
        2
      )}\n`
    );
  } else {
    output.fatal(
      [
        message,
        ...issues.map(issue => `  ${issue.path}: ${issue.message}`),
      ].join('\n')
    );
  }
  return 1;
}

export function handleRulesApiError(
  client: Client,
  err: {
    status: number;
    code?: string;
    serverMessage?: string;
    issues?: unknown;
  },
  jsonOutput: boolean
): number {
  const message =
    err.status === 401
      ? 'You do not have access to alert rules in this team. Ensure your role can manage Alert Rules, or pass --token and --scope.'
      : err.status === 403
        ? err.serverMessage ||
          'You do not have permission to manage alert rules in this team.'
        : err.status >= 500
          ? `The alert rules endpoint failed (${err.status}). Re-run with --debug and share the x-vercel-id from the failed request.`
          : err.serverMessage || `API error (${err.status}).`;

  return outputRulesError(
    client,
    jsonOutput,
    err.code || 'API_ERROR',
    message,
    {
      reason:
        err.status === 401
          ? 'not_authorized'
          : err.status === 403
            ? 'forbidden'
            : err.status === 404
              ? AGENT_REASON.NOT_FOUND
              : err.status === 429
                ? 'rate_limited'
                : AGENT_REASON.API_ERROR,
      issues: getIssues(err),
      hint:
        err.status === 401 || err.status === 403
          ? 'Confirm the team with `vercel whoami`; use --scope <team-slug> if the rule belongs to another team.'
          : undefined,
    }
  );
}

const LEGACY_BODY_FIELDS = ['alertTypes', 'customAlert', 'queryJsonString'];

export function readRuleBody(
  client: Client,
  bodyPath: string,
  jsonOutput: boolean
): JSONObject | number {
  let raw: string;
  try {
    raw = readFileSync(resolve(client.cwd, bodyPath), 'utf8');
  } catch {
    return outputRulesError(
      client,
      jsonOutput,
      'INVALID_ARGUMENTS',
      `Could not read --body file: ${bodyPath}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return outputRulesError(
      client,
      jsonOutput,
      'INVALID_ARGUMENTS',
      'Invalid JSON in --body file.'
    );
  }

  if (!isJSONObject(parsed)) {
    return outputRulesError(
      client,
      jsonOutput,
      'INVALID_ARGUMENTS',
      'The --body file must contain a JSON object.'
    );
  }

  if (LEGACY_BODY_FIELDS.some(field => Object.hasOwn(parsed, field))) {
    return outputRulesError(
      client,
      jsonOutput,
      'LEGACY_ALERT_RULE_BODY',
      'This body uses the previous alert-rules shape. Rewrite it using the built-in or custom schema.',
      {
        hint: 'Run `vercel alerts rules schema --type built-in` or `vercel alerts rules schema --type custom` for examples.',
      }
    );
  }

  return parsed;
}

export function getBodyType(body: JSONObject): PublicAlertRuleType | undefined {
  return body.type === 'built-in' || body.type === 'custom'
    ? body.type
    : undefined;
}

export function emitRulesArgParseError(
  client: Client,
  err: unknown,
  recoverWithProjectFlag: string
): void {
  const message = err instanceof Error ? err.message : String(err);
  const projectFlagMissingArg =
    message.includes('--project') && message.includes('requires argument');
  outputAgentError(
    client,
    {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: projectFlagMissingArg
        ? '`--project` requires a project name or id (for example `--project my-app`).'
        : message,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            projectFlagMissingArg
              ? recoverWithProjectFlag
              : 'alerts rules --help'
          ),
          when: projectFlagMissingArg
            ? 'Retry with a project name or id'
            : 'See valid `alerts rules` subcommands',
        },
      ],
    },
    1
  );
}
