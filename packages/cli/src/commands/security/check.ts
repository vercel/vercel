import chalk from 'chalk';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { getCommandName } from '../../util/pkg-name';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import { SecurityCheckTelemetryClient } from '../../util/telemetry/commands/security/check';
import { checkSubcommand } from './command';
import { SECURITY_CHECKS, isKnownCheck } from './catalog';
import { truncateEnd } from '../../util/output/truncate';
import type {
  SecurityFindingsResponse,
  PostureItem,
  PostureSample,
  SecurityDashboardResponse,
  SecurityPostureMute,
} from './types';

export default async function check(client: Client, argv: string[]) {
  const telemetry = new SecurityCheckTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(checkSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args: checks, flags: opts } = parsedArgs;
  const unknown = checks.filter(slug => !isKnownCheck(slug));
  if (unknown.length > 0) {
    const message = `Unknown check${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Valid slugs: ${SECURITY_CHECKS.map(check => check.slug).join(', ')}`;
    outputAgentError(client, {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'security check <slug>'
          ),
          when: 'Re-run with a valid check slug (replace placeholder)',
        },
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'security check --help'
          ),
          when: 'See all flags and examples',
        },
      ],
    });
    output.error(
      `Unknown check${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Valid slugs:\n  ${SECURITY_CHECKS.map(check => check.slug).join('\n  ')}`
    );
    return 1;
  }

  const limit = opts['--limit'];
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    outputAgentError(client, {
      status: 'error',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: '`--limit` must be a positive integer.',
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'security check --limit <N>'
          ),
          when: 'Re-run with a positive integer (replace placeholder)',
        },
      ],
    });
    output.error('`--limit` must be a positive integer.');
    return 1;
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  telemetry.trackCliArgumentCheck(checks);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagFindings(opts['--findings']);
  telemetry.trackCliOptionLimit(limit);
  telemetry.trackCliOptionProject(opts['--project']);
  telemetry.trackCliFlagJson(opts['--json']);

  const { team, contextName } = await getScope(client);
  if (!team) {
    outputAgentError(client, {
      status: 'error',
      reason: AGENT_REASON.MISSING_SCOPE,
      message:
        'Security checks require a team scope. Run `vercel switch` to select a team.',
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
          when: 'See current user and team',
        },
        {
          command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
          when: 'Switch to a team',
        },
      ],
    });
    output.error(
      `Security checks require a team scope. Run ${getCommandName('switch')} to select a team.`
    );
    return 1;
  }

  const params = new URLSearchParams({
    teamId: team.id,
    maxSamples: String(limit ?? 100),
  });
  for (const slug of checks) {
    params.append('facets', slug);
  }
  const project = opts['--project'];
  if (project) {
    params.set('projectIdOrName', project);
  }

  const dashStamp = stamp();
  output.spinner(
    checks.length > 0
      ? 'Computing security checks…'
      : 'Computing security report…'
  );
  let data: SecurityDashboardResponse;
  try {
    data = await client.fetch<SecurityDashboardResponse>(
      `/dashboard/security-dashboard?${params}`
    );
  } catch (error) {
    output.stopSpinner();
    const status = isAPIError(error) ? error.status : undefined;
    outputAgentError(client, {
      status: 'error',
      reason:
        status === 401 || status === 403
          ? 'not_authorized'
          : status === 429
            ? 'rate_limited'
            : AGENT_REASON.API_ERROR,
      message:
        (isAPIError(error) && error.serverMessage) ||
        'The security report request failed.',
      next: [
        {
          command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
          when: 'Verify the authenticated user and team',
        },
      ],
    });
    printError(error);
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return 0;
  }

  const rows = SECURITY_CHECKS.filter(
    check => checks.length === 0 || checks.includes(check.slug)
  ).map(check => ({ check, posture: data.report[check.slug] }));

  const counts = { failing: 0, passing: 0, muted: 0, unavailable: 0 };
  for (const { posture } of rows) {
    counts[statusOf(posture)]++;
  }
  const summary = [
    `${rows.length} ${rows.length === 1 ? 'check' : 'checks'}`,
    counts.failing > 0 && chalk.red(`${counts.failing} failing`),
    counts.muted > 0 && chalk.yellow(`${counts.muted} muted`),
    counts.unavailable > 0 && chalk.gray(`${counts.unavailable} unavailable`),
    counts.passing > 0 && chalk.green(`${counts.passing} passing`),
  ]
    .filter(Boolean)
    .join(' · ');
  output.log(
    `${summary} under ${chalk.bold(contextName)} ${chalk.gray(dashStamp())}`
  );

  output.print(formatSummaryTable(rows).replace(/^(.*)/gm, ' $1'));
  output.print('\n');

  const showFindings = Boolean(opts['--findings']) || checks.length > 0;
  if (showFindings) {
    for (const { check, posture } of rows) {
      const allFindings =
        !project &&
        posture?.computedAt !== undefined &&
        !posture.unavailable &&
        posture.violationsCount > 0
          ? await fetchAllFindingLabels(client, team.id, check.slug, limit)
          : null;
      printFindings(check.slug, posture, data.mutes, allFindings ?? undefined);
    }
  } else if (counts.failing > 0) {
    output.log('Run with --findings to list individual findings.');
  }

  return 0;
}

type Status = 'failing' | 'passing' | 'muted' | 'unavailable';

function statusOf(posture: PostureItem | undefined): Status {
  if (!posture) return 'unavailable';
  if (posture.unavailableReason === 'muted') return 'muted';
  if (posture.unavailable) return 'unavailable';
  return posture.violationsCount > 0 ? 'failing' : 'passing';
}

function statusLabel(posture: PostureItem | undefined): string {
  const status = statusOf(posture);
  if (status === 'unavailable' && posture?.unavailableReason) {
    return posture.unavailableReason === 'insufficient-permissions'
      ? chalk.gray('no access')
      : chalk.gray('error');
  }
  return {
    failing: chalk.red('failing'),
    passing: chalk.green('passing'),
    muted: chalk.yellow('muted'),
    unavailable: chalk.gray('unavailable'),
  }[status];
}

function violationsLabel(posture: PostureItem | undefined): string {
  if (!posture || posture.unavailable) return chalk.gray('–');
  return posture.truncated
    ? `${posture.violationsCount}+`
    : String(posture.violationsCount);
}

function formatSummaryTable(
  rows: {
    check: { slug: string; risk: string; description: string };
    posture?: PostureItem;
  }[]
) {
  return formatTable(
    ['Check', 'Risk', 'Status', 'Violations', 'Muted', 'Description'],
    ['l', 'l', 'l', 'r', 'r', 'l'],
    [
      {
        rows: rows.map(({ check, posture }) => [
          chalk.bold(check.slug),
          check.risk === 'high' ? chalk.red('high') : chalk.yellow('medium'),
          statusLabel(posture),
          violationsLabel(posture),
          posture?.mutedCount ? String(posture.mutedCount) : chalk.gray('–'),
          chalk.gray(truncateEnd(check.description, 60)),
        ]),
      },
    ]
  );
}

async function fetchAllFindingLabels(
  client: Client,
  teamId: string,
  facet: string,
  limit: number | undefined
): Promise<string[] | null> {
  const labels: string[] = [];
  let cursor: string | undefined;
  try {
    do {
      const params = new URLSearchParams({ teamId, facet, limit: '1000' });
      if (cursor) params.set('cursor', cursor);
      const page = await client.fetch<SecurityFindingsResponse>(
        `/dashboard/security-dashboard/findings?${params}`
      );
      for (const finding of page.findings) {
        if (finding.muted) continue;
        labels.push(
          finding.groupLabel
            ? `${finding.groupLabel} / ${finding.label}`
            : finding.label
        );
        if (limit !== undefined && labels.length >= limit) return labels;
      }
      cursor = page.cursor ?? undefined;
    } while (cursor);
  } catch {
    return null;
  }
  return labels;
}

function flattenSamples(samples: PostureSample[]): string[] {
  return samples.flatMap(sample =>
    sample.samples
      ? sample.samples.map(sub => `${sample.label} / ${sub.label}`)
      : [sample.label]
  );
}

function printFindings(
  slug: string,
  posture: PostureItem | undefined,
  mutes: SecurityPostureMute[] | undefined,
  allFindings?: string[]
) {
  const findings =
    allFindings ??
    (posture && !posture.unavailable ? flattenSamples(posture.samples) : []);
  const mutedFindings = (mutes ?? [])
    .filter(mute => mute.facet === slug && mute.entityId)
    .map(mute => {
      const label = mute.labelSnapshot?.label ?? mute.entityId ?? '';
      const group = mute.labelSnapshot?.groupLabel;
      return group ? `${group} / ${label}` : label;
    });
  if (findings.length === 0 && mutedFindings.length === 0) {
    return;
  }

  output.print(`\n ${chalk.bold(slug)}\n`);
  for (const finding of findings) {
    output.print(`   ${finding}\n`);
  }
  for (const finding of mutedFindings.sort()) {
    output.print(`   ${chalk.dim(`${finding} (muted)`)}\n`);
  }
  if (posture && posture.violationsCount > findings.length) {
    output.print(
      `   ${chalk.gray(`Showing ${findings.length} of ${posture.violationsCount}${posture.truncated ? '+' : ''} findings (raise with --limit)`)}\n`
    );
  }
}
