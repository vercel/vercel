import plural from 'pluralize';
import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { listDrains } from '../../util/drains/api';
import { getContextName } from '../../util/get-scope';
import { remoteText } from '../../util/output/remote-text';
import { parseListLimit, printNextPageHint } from '../../util/pagination';
import {
  decodeListCursor,
  sliceList,
} from '../../util/organizations/pagination';
import { listSubcommand } from './command';
import { formatDrainsTable } from './format';
import { resolveProjectIds } from './input';
import {
  drainsCommand,
  fail,
  handleApiError,
  parseSubcommand,
  printJson,
  progress,
  redactDrain,
  usageError,
} from './shared';

const PATH = 'drains list';

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(client, argv, listSubcommand.options, PATH);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, json } = parsed;

  if (args.length > 0) {
    return usageError(
      client,
      json,
      `vercel ${PATH} takes no arguments. Got ${args.length}.`,
      PATH
    );
  }

  let limit: number;
  try {
    limit = parseListLimit(flags['--limit']);
  } catch (err) {
    return usageError(client, json, (err as Error).message, PATH);
  }
  const start = flags['--next']
    ? decodeListCursor(flags['--next'])
    : { offset: 0 };
  if (!start) {
    return usageError(
      client,
      json,
      'Provide --next with the cursor from the previous page.',
      PATH
    );
  }

  const project = flags['--project'];
  progress(client, json, 'Fetching drains…');
  // The API returns an empty list for a project that doesn't exist, so check
  // it first to tell a typo apart from a project without drains.
  if (project) {
    let resolved;
    try {
      resolved = await resolveProjectIds(client, [project]);
    } catch (err) {
      return handleApiError(client, json, err, { action: 'list drains' });
    }
    if (resolved.missing.length) {
      return fail(client, json, {
        reason: AGENT_REASON.PROJECT_NOT_FOUND,
        message: `Couldn't find project ${remoteText(project)}.`,
        next: [{ command: 'list', when: 'List drains for every project' }],
      });
    }
  }
  let result;
  try {
    result = await listDrains(client, { project });
  } catch (err) {
    return handleApiError(client, json, err, { action: 'list drains' });
  }
  output.stopSpinner();

  const page = sliceList(result.drains, start, limit);
  if (!page) {
    return usageError(
      client,
      json,
      'Provide --next with the cursor from the previous page.',
      PATH
    );
  }

  const warnings = result.deliveryStatsUnavailable
    ? [
        {
          reason: AGENT_REASON.METRICS_UNAVAILABLE,
          message: 'Delivery status is unavailable right now.',
        },
      ]
    : [];

  if (json) {
    return printJson(client, {
      drains: page.items.map(redactDrain),
      pagination: { next: page.next },
      ...(warnings.length ? { warnings } : {}),
    });
  }

  for (const warning of warnings) {
    output.warning(`${warning.message} The Status column is hidden.`);
  }

  if (page.items.length === 0) {
    if (flags['--next']) {
      output.log('No more drains.');
      return 0;
    }
    if (project) {
      output.print(
        `  No drains send data from ${project}. Remove --project to see all drains.\n`
      );
      return 0;
    }
    const context = await getContextName(client);
    output.print(`  No drains in ${context}.\n`);
    output.print(
      `\n  Create one:\n    ${drainsCommand(client, 'create --name <NAME> --type logs --url <URL>')}\n`
    );
    return 0;
  }

  if (client.stdout.isTTY) {
    output.print(
      `  ${plural('drain', result.drains.length, true)}${project ? ` for ${project}` : ''}\n\n`
    );
  }
  client.stdout.write(
    `${formatDrainsTable(client, page.items, {
      withStatus: result.hasDeliveryStats,
    })}\n`
  );
  printNextPageHint(client, page.next);
  return 0;
}
