import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import {
  type Drain,
  type DrainDelivery,
  type UpdateDrainBody,
  getDrain,
  updateDrain,
} from '../../util/drains/api';
import { updateSubcommand } from './command';
import { printReceipt } from './format';
import {
  type Issue,
  readEncoding,
  readEnvironments,
  readHeaders,
  readName,
  readSampleRate,
  readSecret,
  readSources,
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
  readDrainId,
  redactDrain,
  usageError,
} from './shared';

const PATH = 'drains update';

const CHANGE_OPTIONS = [
  '--name',
  '--url',
  '--encoding',
  '--header',
  '--secret',
  '--project',
  '--all',
  '--source',
  '--environment',
  '--sample-rate',
] as const;

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(client, argv, updateSubcommand.options, PATH);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, json } = parsed;

  const id = readDrainId(client, json, args, PATH, 'update');
  if (typeof id === 'number') return id;

  if (!CHANGE_OPTIONS.some(option => flags[option] !== undefined)) {
    return fail(client, json, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: "Can't update the drain without an option to change.",
      next: [{ command: 'update --help', when: 'See the options' }],
    });
  }
  const projects = splitList(flags['--project']);
  if (flags['--all'] && projects) {
    return usageError(client, json, "Can't use --all with --project.", PATH);
  }

  const issues: Issue[] = [];
  const name = readName(flags['--name'], issues);
  const url = readUrl(flags['--url'], issues);
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
  if (projects?.length === 0) {
    issues.push({ field: 'project', message: 'Name at least one project.' });
  }
  if (issues.length) return invalidOptions(client, json, id, issues);

  // The checks below depend on the drain's current type and filter.
  progress(client, json, 'Fetching drain…');
  let current: Drain;
  try {
    current = await getDrain(client, id);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `update drain ${id}`,
      drainId: id,
    });
  }
  output.stopSpinner();

  const deliveryType = current.delivery?.type;
  const encoding = readEncoding(
    flags['--encoding'],
    deliveryType === 'otlphttp' ? 'traces' : 'logs',
    issues
  );
  const changesDelivery =
    url !== undefined ||
    encoding !== undefined ||
    headers !== undefined ||
    flags['--secret'] !== undefined;
  if (
    changesDelivery &&
    deliveryType !== 'http' &&
    deliveryType !== 'otlphttp'
  ) {
    issues.push({
      field: 'url',
      message:
        "This drain's destination isn't an HTTP endpoint. Update it in the dashboard.",
    });
  } else if (changesDelivery && current.source?.kind === 'integration') {
    // The integration signs and authenticates its own deliveries, so a new
    // secret or headers would break them.
    issues.push({
      field: 'url',
      message:
        "An integration manages this drain's destination. Update it in the integration's settings.",
    });
  }
  if (sources && !current.schemas?.log) {
    issues.push({
      field: 'source',
      message: 'Only logs drains have sources. Remove --source.',
    });
  }
  if (environments && !current.schemas?.log) {
    issues.push({
      field: 'environment',
      message: 'Only logs drains filter by environment. Remove --environment.',
    });
  }
  const currentFilter = current.filterV2?.filter;
  // The API only accepts `sources` inside `log`, so a filter with other log
  // keys (drains migrated from the old log drains API) can't be sent back.
  const isBasicFilter =
    current.filterV2 === undefined ||
    (current.filterV2.version === 'v2' &&
      currentFilter?.type === 'basic' &&
      Object.keys(currentFilter.log ?? {}).every(key => key === 'sources'));
  if ((sources || environments) && !isBasicFilter) {
    issues.push({
      field: sources ? 'source' : 'environment',
      message:
        currentFilter?.type === 'basic'
          ? "This drain's filter has a legacy setting the CLI can't keep. Update it in the dashboard."
          : 'This drain uses a custom filter. Update it in the dashboard.',
    });
  }
  if (issues.length) return invalidOptions(client, json, id, issues);

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

  progress(client, json, 'Updating drain…');
  const body: UpdateDrainBody = {};
  if (name !== undefined) body.name = name;

  if (flags['--all']) {
    body.projects = 'all';
  } else if (projects?.length) {
    let resolved;
    try {
      resolved = await resolveProjectIds(client, projects);
    } catch (err) {
      return handleApiError(client, json, err, {
        action: `update drain ${id}`,
      });
    }
    if (resolved.missing.length) {
      return fail(client, json, {
        reason: AGENT_REASON.PROJECT_NOT_FOUND,
        message: `Couldn't find ${resolved.missing.length === 1 ? 'project' : 'projects'} ${resolved.missing.join(', ')}.`,
        data: { projects: resolved.missing },
      });
    }
    body.projects = 'some';
    body.projectIds = resolved.ids;
  }

  if (changesDelivery && current.delivery) {
    body.delivery = toDelivery(current.delivery, {
      url,
      encoding,
      headers,
      secret,
    });
  }

  if (sources || environments) {
    body.filter =
      toFilter(
        { sources, environments },
        currentFilter?.type === 'basic' ? currentFilter : undefined
      ) ?? null;
  }

  if (sampleRate !== undefined) {
    body.sampling = toSampling(sampleRate) ?? null;
  }

  let drain;
  try {
    drain = await updateDrain(client, id, body);
  } catch (err) {
    return handleApiError(client, json, err, {
      action: `update drain ${id}`,
      drainId: id,
    });
  }
  output.stopSpinner();

  if (json) {
    return printJson(client, {
      drain: redactDrain(drain),
      outcome: 'updated',
      next: inspectNext(client, drain.id),
    });
  }
  printReceipt('Updated', drain, { details: true });
  printStdoutIdentifier(client, drain.id);
  return 0;
}

function invalidOptions(
  client: Client,
  json: boolean,
  id: string,
  issues: Issue[]
): number {
  return fail(client, json, {
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    message: `Can't update drain ${id}. ${issues.length === 1 ? '1 option is' : `${issues.length} options are`} invalid.`,
    issues,
  });
}

/**
 * The full delivery to send: the API replaces it as a whole, so the current
 * settings (including the stored secret) are kept and only the changed fields
 * are replaced.
 */
function toDelivery(
  current: DrainDelivery,
  changes: {
    url?: string;
    encoding?: string;
    headers?: Record<string, string>;
    secret?: string;
  }
): DrainDelivery {
  const secret = changes.secret ?? current.secret;
  const base = {
    encoding: changes.encoding ?? current.encoding,
    headers: changes.headers ?? current.headers ?? {},
    ...(secret ? { secret } : {}),
  };
  if (current.type === 'otlphttp') {
    return {
      type: 'otlphttp',
      endpoint: changes.url
        ? { traces: changes.url }
        : (current.endpoint as { traces: string }),
      ...base,
    } as DrainDelivery;
  }
  return {
    type: 'http',
    endpoint: changes.url ?? current.endpoint,
    ...('compression' in current && current.compression
      ? { compression: current.compression }
      : {}),
    ...base,
  } as DrainDelivery;
}
