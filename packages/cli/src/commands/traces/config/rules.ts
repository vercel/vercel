import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../../util/client';
import { warnDeprecatedInput } from '../../../util/warn-deprecated-subcommand';
import { RULE_ENVIRONMENTS } from './command';

/** The API caps drain sampling at ten items. */
export const RULE_LIMIT = 10;

/** The command line reads a rate as a whole percentage. */
export const MIN_SAMPLE_RATE = 1;
export const MAX_SAMPLE_RATE = 100;

export type RuleEnvironment = (typeof RULE_ENVIRONMENTS)[number];

export type DrainSamplingRule = {
  type: 'head_sampling';
  rate: number;
  env?: 'production' | 'preview';
  requestPath?: string;
};

export type TracingConfig = {
  enabled: boolean;
  sampling: DrainSamplingRule[];
};

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
export function toRow(rule: DrainSamplingRule): SamplingRuleRow {
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
export function toRule(row: SamplingRuleRow): DrainSamplingRule {
  return {
    type: 'head_sampling',
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

/**
 * `set` and `rm` used to take the environment as their first argument
 * (`traces config set production 25`). It is `--environment` now. Without the
 * option, a first argument that is an environment is still read as one, with a
 * deprecation warning; any other first argument starts the new form, so the
 * environment comes back `undefined` and the caller reports it missing. With
 * the option, an environment argument is a usage error.
 */
export function resolveRuleEnvironment(
  client: Client,
  environmentFlag: string | undefined,
  args: string[]
): { environment: string | undefined; args: string[] } | { error: string } {
  if (environmentFlag === undefined) {
    const [environment, ...rest] = args;
    if (environment !== undefined && isRuleEnvironment(environment)) {
      warnDeprecatedInput(client, 'The environment argument', '--environment');
      return { environment, args: rest };
    }
    return { environment: undefined, args };
  }
  if (args[0] !== undefined && isRuleEnvironment(args[0])) {
    return {
      error:
        "Can't use an environment argument with --environment. Use --environment.",
    };
  }
  return { environment: environmentFlag, args };
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
  rule: DrainSamplingRule;
  row: SamplingRuleRow;
};

export async function readTracingConfig({
  client,
  teamId,
  projectId,
  projectName,
}: {
  client: Client;
  teamId: string;
  projectId: string;
  projectName: string;
}) {
  const config = await client.fetch<TracingConfig>(
    `/v1/drains/tracing/config?${new URLSearchParams({ projectId })}`,
    { accountId: teamId }
  );
  const sampling: DrainSamplingRule[] =
    config.enabled && config.sampling.length === 0
      ? [{ type: 'head_sampling', rate: 1 }]
      : config.sampling;
  return {
    project: { id: projectId, name: projectName },
    enabled: config.enabled,
    entries: sampling.map(rule => ({ rule, row: toRow(rule) })),
  };
}

export async function writeSamplingRules({
  client,
  teamId,
  projectId,
  rules,
}: {
  client: Client;
  teamId: string;
  projectId: string;
  rules: DrainSamplingRule[];
}): Promise<void> {
  await client.fetch(
    `/v1/drains/tracing/config?${new URLSearchParams({ projectId })}`,
    {
      accountId: teamId,
      method: 'PUT',
      body: {
        enabled: rules.length > 0,
        ...(rules.length > 0 ? { sampling: rules } : {}),
      } as unknown as JSONObject,
    }
  );
}
