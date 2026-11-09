import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  MAX_SEARCH_QUERY_CHARS,
  listApiKeysPage,
  type ApiKey,
} from '../../util/ai-gateway/api-keys';
import {
  DIRECTORY_KILL_SWITCH,
  DIRECTORY_KEY_SORTS,
  DIRECTORY_KEY_STATES,
  isDirectoryCursor,
  isDirectoryEnabledByEnv,
  isDirectoryUnavailable,
  listDirectoryKeysPage,
  resolveDirectoryKeyQuotas,
  toApiKey,
  type DirectoryKeyQuota,
  type DirectoryKeySort,
  type DirectoryKeyState,
} from '../../util/ai-gateway/directory';
import { parseListLimit, type Page } from '../../util/pagination';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getUser from '../../util/get-user';
import { getTeamMemberByIdentifier } from '../../util/teams/get-team-member';
import output from '../../output-manager';
import { isAPIError } from '../../util/errors-ts';
import { AiGatewayApiKeysListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/api-keys-list';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import {
  listScopeBudgetDefaults,
  type ScopeBudgetDefault,
} from '../../util/ai-gateway/budgets';

// `purged` tombstones are a reconciliation detail; the CLI lists the rest.
const STATE_FLAG_VALUES: DirectoryKeyState[] = DIRECTORY_KEY_STATES.filter(
  s => s !== 'purged'
);
const SORT_FIELDS = ['createdAt', 'lastActiveAt', 'name', 'expiresAt'] as const;

// `/v1/api-keys` lists live keys most recently used first. `active` is the
// closest match: `any` would surface deleted keys as if they were live.
const DEFAULT_STATE: DirectoryKeyState = 'active';
const DEFAULT_SORT: DirectoryKeySort = 'lastActiveAt:desc';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayApiKeysListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts } = parsedArgs;

  const queryFlag = opts['--query'] as string | undefined;
  const searchFlag = opts['--search'] as string | undefined;
  const search = queryFlag ?? searchFlag;
  const creator = opts['--creator'] as string | undefined;
  const stateFlag = opts['--state'] as string | undefined;
  const sortFlag = opts['--sort'] as string | undefined;
  const limitFlag = opts['--limit'] as number | undefined;
  const next = opts['--next'] as string | undefined;

  telemetry.trackCliOptionQuery(queryFlag);
  telemetry.trackCliOptionSearch(searchFlag);
  telemetry.trackCliOptionCreator(creator);
  telemetry.trackCliOptionState(stateFlag);
  telemetry.trackCliOptionSort(sortFlag);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionNext(next);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }

  if (
    queryFlag !== undefined &&
    searchFlag !== undefined &&
    queryFlag !== searchFlag
  ) {
    return usageError(client, 'Pass only one of --query or --search.');
  }
  if (search !== undefined && search.trim().length === 0) {
    return usageError(client, 'The --query option requires some text.');
  }
  if (search && search.length > MAX_SEARCH_QUERY_CHARS) {
    return usageError(
      client,
      `The --query option must be at most ${MAX_SEARCH_QUERY_CHARS} characters.`
    );
  }
  if (
    stateFlag !== undefined &&
    !STATE_FLAG_VALUES.includes(stateFlag as DirectoryKeyState)
  ) {
    return usageError(
      client,
      `The --state option must be one of: ${STATE_FLAG_VALUES.join(', ')}.`
    );
  }
  const sort = sortFlag === undefined ? undefined : parseSortFlag(sortFlag);
  if (sortFlag !== undefined && !sort) {
    return usageError(
      client,
      `The --sort option must be one of ${SORT_FIELDS.join(', ')}, optionally followed by :asc or :desc.`
    );
  }
  if (creator !== undefined && creator.trim().length === 0) {
    return usageError(client, 'The --creator option requires a team member.');
  }

  let limit: number;
  try {
    limit = parseListLimit(limitFlag);
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  // Default-capped keys render `$50 (default)`, not a dash reading as unlimited.
  let keyDefault: ScopeBudgetDefault | undefined;
  if (!formatResult.jsonOutput) {
    try {
      const defaults = await listScopeBudgetDefaults(client);
      keyDefault = defaults.find(
        d => d.scopeType === 'api-key' && d.active !== false
      );
    } catch {}
  }

  // Filters the canonical store cannot express; a directory outage then
  // fails the command rather than returning a silently wrong list.
  const directoryOnly =
    creator !== undefined ||
    stateFlag !== undefined ||
    sortFlag !== undefined ||
    (next !== undefined && isDirectoryCursor(next));
  // A cursor from the canonical store is only valid there.
  const legacyOnly =
    !isDirectoryEnabledByEnv() ||
    (next !== undefined && !isDirectoryCursor(next));

  if (directoryOnly && legacyOnly) {
    let message: string;
    if (isDirectoryEnabledByEnv()) {
      message =
        'The --next cursor does not belong to this query. Rerun without --next to start from the first page.';
    } else if (next !== undefined && isDirectoryCursor(next)) {
      message = `The --next cursor came from the AI Gateway key directory, which ${DIRECTORY_KILL_SWITCH} disables in this environment. Rerun without --next to start from the first page.`;
    } else {
      message = `The --creator, --state, and --sort options need the AI Gateway key directory, which ${DIRECTORY_KILL_SWITCH} disables in this environment.`;
    }
    return usageError(client, message);
  }

  let createdBy: string | undefined;
  if (creator !== undefined) {
    try {
      createdBy = await resolveCreator(client, creator.trim());
    } catch (err: unknown) {
      if (err instanceof UnknownCreatorError) {
        return usageError(client, err.message);
      }
      if (isAPIError(err)) {
        output.error(
          `Could not look up team member "${creator}": ${err.message}`
        );
        return 1;
      }
      throw err;
    }
  }

  // The index carries no key metadata, so a directory page can't say whether
  // a key has Token Pass; the table shows that column as unknown.
  type KeyPage = Page<ApiKey> & { metadataKnown: boolean };
  const legacyPage = async (): Promise<KeyPage> => ({
    ...(await listApiKeysPage(client, { limit, next, search })),
    metadataKnown: true,
  });
  const fetch = async (): Promise<KeyPage> => {
    if (legacyOnly) {
      return legacyPage();
    }
    try {
      return await fetchDirectoryPage(client, {
        search,
        createdBy,
        state: (stateFlag as DirectoryKeyState | undefined) ?? DEFAULT_STATE,
        sort: sort ?? DEFAULT_SORT,
        cursor: next,
        limit,
      });
    } catch (err: unknown) {
      if (!isDirectoryUnavailable(err)) {
        throw err;
      }
      output.debug(
        `AI Gateway key directory unavailable: ${err instanceof Error ? err.message : String(err)}`
      );
      if (directoryOnly) {
        throw new DirectoryUnavailableError();
      }
      return legacyPage();
    }
  };

  try {
    return await renderResource<KeyPage>(client, {
      asJson: formatResult.jsonOutput,
      spinnerText: 'Fetching API keys',
      fetch,
      toJSON: page => ({
        apiKeys: page.items,
        pagination: { next: page.next },
      }),
      isEmpty: page => page.items.length === 0,
      emptyMessage: emptyMessage({ next, search, creator, stateFlag }),
      header: () => 'API keys',
      renderTable: page =>
        printApiKeysTable(page.items, keyDefault, page.metadataKnown),
      next: page => page.next,
    });
  } catch (err: unknown) {
    if (err instanceof DirectoryUnavailableError) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.API_ERROR,
          message: err.message,
          next: [{ command: getCommandNamePlain('ai-gateway api-keys list') }],
        },
        1
      );
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}

class DirectoryUnavailableError extends Error {
  constructor() {
    super(
      'The AI Gateway key directory is temporarily unavailable, so --creator, --state, --sort, and directory cursors cannot be served. Retry shortly, or list without those options.'
    );
    this.name = 'DirectoryUnavailableError';
  }
}

function usageError(client: Client, message: string): number {
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [{ command: getCommandNamePlain('ai-gateway api-keys list') }],
    },
    2
  );
  output.error(message);
  return 2;
}

// `createdAt` alone means newest first; `name` alone means A→Z.
function parseSortFlag(value: string): DirectoryKeySort | undefined {
  if (DIRECTORY_KEY_SORTS.includes(value as DirectoryKeySort)) {
    return value as DirectoryKeySort;
  }
  if (SORT_FIELDS.includes(value as (typeof SORT_FIELDS)[number])) {
    const direction = value === 'name' ? 'asc' : 'desc';
    return `${value}:${direction}` as DirectoryKeySort;
  }
  return undefined;
}

class UnknownCreatorError extends Error {
  constructor(identifier: string) {
    super(`No team member matches "${identifier}".`);
    this.name = 'UnknownCreatorError';
  }
}

// `me` is the signed-in user; anything else is looked up on the team roster.
// An email must match a member; any other identifier falls through as a raw
// user id, since the creator of an old key may have left the team.
async function resolveCreator(
  client: Client,
  identifier: string
): Promise<string> {
  if (identifier === 'me') {
    const user = await getUser(client);
    return user.id;
  }
  const member = await getTeamMemberByIdentifier(
    client,
    client.config.currentTeam as string,
    identifier
  );
  if (member) {
    return member.uid;
  }
  if (identifier.includes('@')) {
    throw new UnknownCreatorError(identifier);
  }
  output.debug(
    `No team member matches "${identifier}"; using it as a user id.`
  );
  return identifier;
}

// Budgets live outside the index; one batch call covers the displayed page.
// A budget outage degrades the budget columns, not the listing.
async function fetchDirectoryPage(
  client: Client,
  opts: Parameters<typeof listDirectoryKeysPage>[1]
): Promise<Page<ApiKey> & { metadataKnown: false }> {
  const page = await listDirectoryKeysPage(client, opts);
  const liveIds = page.items
    .filter(key => key.state === 'active')
    .map(key => key.keyId);
  let quotas = new Map<string, DirectoryKeyQuota>();
  if (liveIds.length > 0) {
    try {
      quotas = await resolveDirectoryKeyQuotas(client, liveIds);
    } catch (err: unknown) {
      output.debug(
        `Skipping AI Gateway key budgets in list output: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return {
    items: page.items.map(key => toApiKey(key, quotas.get(key.keyId))),
    next: page.next,
    metadataKnown: false,
  };
}

function emptyMessage({
  next,
  search,
  creator,
  stateFlag,
}: {
  next?: string;
  search?: string;
  creator?: string;
  stateFlag?: string;
}): string {
  if (next) {
    return 'No more API keys.';
  }
  if (search || creator || stateFlag) {
    return 'No API keys match these filters.';
  }
  return `No API keys found. Create one with ${getCommandName('ai-gateway api-keys create')}.`;
}

function printApiKeysTable(
  apiKeys: ApiKey[],
  keyDefault: ScopeBudgetDefault | undefined,
  metadataKnown: boolean
) {
  return `${table(
    [
      [
        'id',
        'name',
        'key',
        'token pass',
        'budget',
        'spend',
        'refresh',
        'created',
      ].map(header => chalk.gray(header)),
      ...apiKeys.map(apiKey => [
        apiKey.id,
        apiKey.name || chalk.gray('–'),
        apiKey.partialKey ? `…${apiKey.partialKey}` : chalk.gray('–'),
        metadataKnown
          ? apiKey.metadata?.tokenPass
            ? 'yes'
            : 'no'
          : chalk.gray('–'),
        apiKey.quota
          ? `$${apiKey.quota.limitAmount}`
          : keyDefault
            ? `$${keyDefault.limitAmount} ${chalk.gray('(default)')}`
            : chalk.gray('–'),
        apiKey.quota ? `$${apiKey.quota.currentSpend}` : chalk.gray('–'),
        apiKey.quota?.refreshPeriod ??
          keyDefault?.refreshPeriod ??
          chalk.gray('–'),
        apiKey.createdAt
          ? new Date(apiKey.createdAt).toLocaleDateString()
          : chalk.gray('–'),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
