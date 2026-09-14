import type {
  JSONObject,
  Project,
  ProjectTracing,
  ProjectTracingSamplingRule,
} from '@vercel-internals/types';
import type Client from '../../../util/client';
import { RULE_ENVIRONMENTS } from './command';

/** The API caps `tracing.samplingRules` at ten items. */
export const RULE_LIMIT = 10;

/** The command line reads a rate as a whole percentage. */
export const MIN_SAMPLE_RATE = 1;
export const MAX_SAMPLE_RATE = 100;

export type RuleEnvironment = (typeof RULE_ENVIRONMENTS)[number];

/**
 * One sampling rule in CLI vocabulary. A row read from `ls --json` can be fed
 * straight back into `set`, so `sampleRate` is a whole percentage (1-100) and
 * an absent path is an explicit `null` rather than a missing key.
 */
export type SamplingRuleRow = {
  environment: RuleEnvironment;
  requestPath: string | null;
  sampleRate: number;
};

export function isRuleEnvironment(value: string): value is RuleEnvironment {
  return (RULE_ENVIRONMENTS as readonly string[]).includes(value);
}

export const ENVIRONMENT_ERROR = `\`environment\` must be one of: ${RULE_ENVIRONMENTS.join(', ')}.`;

export const RATE_ERROR = `\`rate\` must be a whole number from ${MIN_SAMPLE_RATE} to ${MAX_SAMPLE_RATE}.`;

export const EMPTY_PATH_ERROR = '`requestPath` cannot be empty.';

/**
 * Parses a rate from the command line. The product does not offer rates under
 * one percent, so a fraction is rejected rather than silently rounded.
 */
export function parseSampleRate(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) {
    return undefined;
  }
  const rate = Number(value);
  return rate >= MIN_SAMPLE_RATE && rate <= MAX_SAMPLE_RATE ? rate : undefined;
}

/**
 * Converts an API rule to CLI vocabulary. The API stores a fraction from 0 to
 * 1; the command line speaks whole percentages, so 0.25 reads as 25. Rounding
 * absorbs float noise (0.07 * 100 is 7.000000000000001).
 */
export function toRow(rule: ProjectTracingSamplingRule): SamplingRuleRow {
  return {
    environment: rule.env ?? 'any',
    requestPath: rule.requestPath ?? null,
    sampleRate: Math.round(rule.rate * 100),
  };
}

/** The rate as the API stores it: a fraction from 0 to 1. */
export function toApiRate(sampleRate: number): number {
  return sampleRate / 100;
}

/**
 * Converts a CLI row back to an API rule. `any` and an absent path are encoded
 * by leaving the key off entirely, which is how the API spells "every
 * environment" and "every path".
 */
export function toRule(row: SamplingRuleRow): ProjectTracingSamplingRule {
  return {
    rate: toApiRate(row.sampleRate),
    ...(row.environment === 'any' ? {} : { env: row.environment }),
    ...(row.requestPath === null ? {} : { requestPath: row.requestPath }),
  };
}

/** Human label for a rule that covers every path in its environment. */
export const ALL_PATHS_LABEL = '(all paths)';

export function formatPath(requestPath: string | null): string {
  return requestPath ?? ALL_PATHS_LABEL;
}

export function formatRate(sampleRate: number): string {
  return `${sampleRate}%`;
}

/** Names the rule a message is about, without its rate. */
export function formatRuleTarget(
  environment: RuleEnvironment,
  requestPath: string | null
): string {
  return `${environment} ${formatPath(requestPath)}`;
}

/** Names a rule and its rate, for a one-per-line listing. */
export function formatRuleLine(row: SamplingRuleRow): string {
  return `${formatRuleTarget(row.environment, row.requestPath)} ${formatRate(row.sampleRate)}`;
}

/**
 * The number of command words (`traces config <subcommand>`) that precede a
 * subcommand's own positional arguments. Each subcommand parses the whole argv
 * so it can see global flags such as `--scope`, which leaves these three words
 * at the front of the positional list.
 */
const COMMAND_WORD_COUNT = 3;

export function subcommandArguments(positional: string[]): string[] {
  return positional.slice(COMMAND_WORD_COUNT);
}

/** A rule's identity is the pair (environment, path). */
export function hasSameKey(a: SamplingRuleRow, b: SamplingRuleRow): boolean {
  return a.environment === b.environment && a.requestPath === b.requestPath;
}

/**
 * One rule as the API stores it, paired with its reading in CLI vocabulary.
 *
 * That vocabulary is lossy on purpose: the command line offers whole
 * percentages, so an API rate of 0.075 reads as 8%. Writes therefore send the
 * `rule` object the API sent, and only the rule a command actually edits is
 * rebuilt from its `row` — otherwise setting one rule would quietly rewrite a
 * neighbour from 0.075 to 0.08.
 */
export type SamplingRuleEntry = {
  rule: ProjectTracingSamplingRule;
  row: SamplingRuleRow;
};

export type ProjectTracingConfig = {
  project: Project;
  /** `null` when the project has never used tracing. */
  tracing: ProjectTracing | null;
  /** Every rule the project has, in the order the API returned them. */
  entries: SamplingRuleEntry[];
};

/**
 * Reads the whole `tracing` object off the project.
 *
 * The team goes through `accountId` rather than onto the query string so
 * `client.fetch` applies its own rule for this endpoint: it forwards a
 * `team_`-prefixed id as `teamId` and drops anything else, which is how every
 * other `/v9/projects` caller behaves. `traces get` forwards its scope verbatim
 * instead, but that is a property of `/v1/projects/traces`, which documents
 * accepting a slug or an id, and it does not transfer here.
 */
export async function readProjectTracing({
  client,
  teamId,
  projectId,
}: {
  client: Client;
  teamId: string;
  projectId: string;
}): Promise<ProjectTracingConfig> {
  const project = await client.fetch<Project>(
    `/v9/projects/${encodeURIComponent(projectId)}`,
    { accountId: teamId }
  );
  const tracing = project.tracing ?? null;
  return {
    project,
    tracing,
    entries: (tracing?.samplingRules ?? []).map(rule => ({
      rule,
      row: toRow(rule),
    })),
  };
}

/**
 * Writes the whole `tracing` object back with only `samplingRules` changed, so
 * `domains` and `ignorePaths` survive whether the API merges or replaces the
 * nested object. A project that has never used tracing sends `samplingRules`
 * alone rather than inventing the other two fields.
 *
 * `rules` are API rules, not CLI rows: the caller passes through the objects it
 * read for every rule it did not edit.
 */
export async function writeSamplingRules({
  client,
  teamId,
  projectId,
  tracing,
  rules,
}: {
  client: Client;
  teamId: string;
  projectId: string;
  tracing: ProjectTracing | null;
  rules: ProjectTracingSamplingRule[];
}): Promise<void> {
  const body = {
    tracing: { ...(tracing ?? {}), samplingRules: rules },
  };
  // The team goes through `accountId` for the same reason as the read.
  await client.fetch(`/v9/projects/${encodeURIComponent(projectId)}`, {
    accountId: teamId,
    method: 'PATCH',
    body: body as unknown as JSONObject,
  });
}
