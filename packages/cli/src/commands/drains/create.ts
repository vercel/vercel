import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  type CreateDrainBody,
  DRAIN_SCHEMAS,
  createDrain,
} from '../../util/drains/api';
import { isAPIError } from '../../util/errors-ts';
import { getContextName } from '../../util/get-scope';
import { createSubcommand } from './command';
import { printReceipt } from './format';
import {
  encodingsFor,
  getDashboardOnlyType,
  type Issue,
  readEncoding,
  readEnvironments,
  readHeaders,
  readName,
  readSampleRate,
  readSecret,
  readSources,
  readType,
  readUrl,
  resolveProjectIds,
  toFilter,
  toSampling,
  splitList,
} from './input';
import {
  fail,
  handleApiError,
  inspectNext,
  parseSubcommand,
  printJson,
  printStdoutIdentifier,
  progress,
  redactDrain,
  usageError,
} from './shared';

const PATH = 'drains create';

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(client, argv, createSubcommand.options, PATH);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, json } = parsed;

  if (args.length > 0) {
    return usageError(
      client,
      json,
      `vercel ${PATH} takes no arguments. Pass the URL with --url.`,
      PATH
    );
  }

  const dashboardOnly = getDashboardOnlyType(flags['--type']);
  if (dashboardOnly) {
    // The link is a convenience: if the team can't be looked up, the error
    // still says what to do.
    const team = await getContextName(client).catch(() => undefined);
    return fail(client, json, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `Can't create ${dashboardOnly} with the CLI yet.${team ? '' : ' Create it in the dashboard.'}`,
      ...(team
        ? {
            link: {
              when: 'Create it in the dashboard',
              url: `https://vercel.com/${encodeURIComponent(team)}/~/settings/drains`,
            },
          }
        : {}),
    });
  }

  const missing = (['name', 'url', 'type'] as const).filter(
    option => flags[`--${option}`] === undefined
  );
  if (missing.length) {
    const list = missing.map(option => `--${option}`).join(', ');
    return fail(client, json, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: `Can't create a drain without ${list}.`,
      next: [
        {
          command: 'create --name <NAME> --type <TYPE> --url <URL>',
          when: 'Pass every required option',
        },
      ],
    });
  }

  const issues: Issue[] = [];
  const name = readName(flags['--name'], issues);
  const url = readUrl(flags['--url'], issues);
  const type = readType(flags['--type'], issues);
  const encoding = readEncoding(flags['--encoding'], type, issues);
  const headers = readHeaders(
    flags['--header'] as string[] | undefined,
    issues
  );
  const sources = readSources(
    flags['--source'] as string[] | undefined,
    issues
  );
  const environments = readEnvironments(
    flags['--environment'] as string[] | undefined,
    issues
  );
  const sampleRate = readSampleRate(flags['--sample-rate'], issues);
  const projects = splitList(flags['--project']);
  if (projects?.length === 0) {
    issues.push({ field: 'project', message: 'Name at least one project.' });
  }
  if (sources && type && type !== 'logs') {
    issues.push({
      field: 'source',
      message: 'Only logs drains have sources. Remove --source.',
    });
  }
  if (environments && type && type !== 'logs') {
    issues.push({
      field: 'environment',
      message: 'Only logs drains filter by environment. Remove --environment.',
    });
  }
  if (issues.length || !name || !url || !type) {
    return fail(client, json, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `Can't create the drain. ${issues.length === 1 ? '1 option is' : `${issues.length} options are`} invalid.`,
      issues,
    });
  }

  let secret: string | undefined;
  try {
    secret = await readSecret(client, flags['--secret']);
  } catch {
    return fail(client, json, {
      reason: AGENT_REASON.STDIN_ERROR,
      message: "Couldn't read the secret from stdin.",
    });
  }
  if (secret === '') {
    return usageError(
      client,
      json,
      'The --secret value is empty. Pass a value, or pipe it to --secret -.',
      PATH
    );
  }

  progress(client, json, 'Creating drain…');
  let projectIds: string[] | undefined;
  if (projects?.length) {
    let resolved;
    try {
      resolved = await resolveProjectIds(client, projects);
    } catch (err) {
      return handleApiError(client, json, err, { action: 'create the drain' });
    }
    if (resolved.missing.length) {
      return fail(client, json, {
        reason: AGENT_REASON.PROJECT_NOT_FOUND,
        message: `Couldn't find ${resolved.missing.length === 1 ? 'project' : 'projects'} ${resolved.missing.join(', ')}.`,
        data: { projects: resolved.missing },
      });
    }
    projectIds = resolved.ids;
  }

  const finalEncoding = encoding ?? encodingsFor(type)[0];
  const body: CreateDrainBody = {
    name,
    projects: projectIds ? 'some' : 'all',
    ...(projectIds ? { projectIds } : {}),
    schemas: DRAIN_SCHEMAS[type],
    delivery:
      type === 'traces'
        ? {
            type: 'otlphttp',
            endpoint: { traces: url },
            encoding: finalEncoding as 'json' | 'proto',
            headers: headers ?? {},
            ...(secret ? { secret } : {}),
          }
        : {
            type: 'http',
            endpoint: url,
            encoding: finalEncoding as 'json' | 'ndjson',
            headers: headers ?? {},
            ...(secret ? { secret } : {}),
          },
    source: { kind: 'self-served' },
  };
  const sampling =
    sampleRate === undefined ? undefined : toSampling(sampleRate);
  if (sampling) body.sampling = sampling;
  const filter = toFilter({ sources, environments });
  if (filter) body.filter = filter;

  let drain;
  try {
    drain = await createDrain(client, body);
  } catch (err) {
    // The request isn't retried, so a server or network failure leaves its
    // outcome unknown: check before creating the drain again.
    if (!isAPIError(err) || err.status >= 500) {
      return fail(client, json, {
        reason: AGENT_REASON.UNKNOWN_OUTCOME,
        message: isAPIError(err)
          ? "Can't confirm whether the drain was created. The API failed to respond."
          : "Can't confirm whether the drain was created. The request failed.",
        next: [
          {
            command: 'list',
            when: 'Check whether it exists before creating it again',
          },
        ],
        ...(isAPIError(err) ? { data: { httpStatus: err.status } } : {}),
      });
    }
    return handleApiError(client, json, err, { action: 'create the drain' });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, {
      drain: redactDrain(drain),
      outcome: 'created',
      next: inspectNext(client, drain.id),
    });
  }
  printReceipt('Created', drain, { details: true });
  printStdoutIdentifier(client, drain.id);
  return 0;
}
