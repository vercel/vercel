import chalk from 'chalk';
import Sema from 'async-sema';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  listBudgetsPage,
  listScopeBudgetDefaults,
  BUDGET_SCOPE_TYPES,
  BUDGET_DEFAULT_SCOPE_TYPES,
  BUDGET_DEFAULT_COVERED,
  type Budget,
  type BudgetSetScopeType,
  type BudgetDefaultScopeType,
  type ScopeBudgetDefault,
  type BudgetsPage,
  type DefaultCoveredCounts,
} from '../../util/ai-gateway/budgets';
import { getApiKey, listApiKeysPage } from '../../util/ai-gateway/api-keys';
import {
  isDirectoryEnabledByEnv,
  resolveDirectoryIdentities,
  type ResolvedDirectoryIdentities,
} from '../../util/ai-gateway/directory';
import {
  DEFAULT_LIST_LIMIT,
  parseListLimit,
  printNextPageHint,
} from '../../util/pagination';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import {
  getTeamMembersByIds,
  teamMemberLabel,
  type TeamMember,
} from '../../util/teams/get-team-member';
import output from '../../output-manager';
import { AiGatewayBudgetsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/budgets-list';
import { budgetsListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayBudgetsListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    budgetsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts } = parsedArgs;

  const scopeType = opts['--scope-type'] as string | undefined;
  const showDefaults = opts['--defaults'] as boolean | undefined;
  const limitFlag = opts['--limit'] as number | undefined;
  const next = opts['--next'] as string | undefined;

  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionNext(next);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliOptionScopeType(scopeType);
  telemetry.trackCliFlagDefaults(showDefaults);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  if (
    scopeType !== undefined &&
    !BUDGET_SCOPE_TYPES.includes(scopeType as BudgetSetScopeType)
  ) {
    output.error(
      `The --scope-type option must be one of: ${BUDGET_SCOPE_TYPES.join(', ')}.`
    );
    return 2;
  }
  const scopeFilter = scopeType as BudgetSetScopeType | undefined;

  if (showDefaults && scopeFilter === 'team') {
    output.error(
      'The team scope does not support --default. Drop --defaults to list the team budget.'
    );
    return 1;
  }

  if (showDefaults && (limitFlag !== undefined || next !== undefined)) {
    output.error(
      'The --limit and --next options do not apply to --defaults, which lists every default in one page.'
    );
    return 1;
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

  if (showDefaults) {
    return await listDefaults(client, { scopeType: scopeFilter, asJson });
  }

  output.spinner('Fetching budgets…');

  let page: BudgetsPage;
  let defaults: ScopeBudgetDefault[];
  try {
    [page, defaults] = await Promise.all([
      listBudgetsPage(client, {
        scopeType: scopeFilter,
        limit,
        next,
        includeDefaultCovered: false,
      }),
      // The defaults section is a summary, so only the first page shows it.
      asJson || next
        ? []
        : listScopeBudgetDefaults(client).catch((err: unknown) => {
            output.debug(
              `Skipping budget defaults in list output: ${err instanceof Error ? err.message : String(err)}`
            );
            return [];
          }),
    ]);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  const configured = page.items;
  const counts = page.defaultCoveredCounts;

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(
      `${JSON.stringify(
        {
          budgets: configured,
          pagination: { next: page.next },
          defaultCoveredCounts: counts,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  if (configured.length === 0) {
    output.stopSpinner();
    if (next) {
      output.log('No more budgets.');
      return 0;
    }
    output.log(
      scopeType
        ? `No ${scopeType} budgets found. Set one with ${getCommandName('ai-gateway budgets set')}.`
        : `No budgets found. Set one with ${getCommandName('ai-gateway budgets set')}.`
    );
    printDefaultsSection(defaults, counts, scopeFilter);
    printNextPageHint(client, page.next);
    return 0;
  }

  const names = await resolveScopeNames(client, configured);

  output.stopSpinner();

  printDefaultsSection(defaults, counts, scopeFilter);
  output.log('Custom budgets');
  client.stdout.write(printBudgetsTable(configured, names));
  printNextPageHint(client, page.next);
  return 0;
}

// The budgets list carries no key names. The key directory names a batch of
// ids in one call (deleted keys included); the canonical store is the
// fallback: up to a page of keys by id, past that a walk of the key list.
const KEY_LOOKUP_BY_ID_MAX = DEFAULT_LIST_LIMIT;
const KEY_LOOKUP_CONCURRENCY = 5;
const KEY_ROSTER_PAGE_SIZE = 100;
const KEY_ROSTER_MAX_PAGES = 1000;

// Names and member labels are best-effort; a directory failure leaves every
// lookup to the canonical readers below.
const DIRECTORY_SKIPPED: ResolvedDirectoryIdentities = {
  keys: new Map(),
  users: null,
};

async function resolveDirectoryLabels(
  client: Client,
  input: { keyIds: string[]; userIds: string[] }
): Promise<ResolvedDirectoryIdentities> {
  if (
    !isDirectoryEnabledByEnv() ||
    (input.keyIds.length === 0 && input.userIds.length === 0)
  ) {
    return DIRECTORY_SKIPPED;
  }
  try {
    return await resolveDirectoryIdentities(client, input);
  } catch (err: unknown) {
    output.debug(
      `Skipping AI Gateway key directory labels: ${err instanceof Error ? err.message : String(err)}`
    );
    return DIRECTORY_SKIPPED;
  }
}

// Once the directory has answered, leftovers are ghosts it has no record of
// or keys too new to be indexed: worth a few lookups by id, never a roster walk.
async function resolveApiKeyNames(
  client: Client,
  ids: string[],
  { directoryAnswered = false } = {}
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) {
    return names;
  }
  if (directoryAnswered) {
    ids = ids.slice(0, KEY_LOOKUP_BY_ID_MAX);
  }
  if (ids.length <= KEY_LOOKUP_BY_ID_MAX) {
    const sema = new Sema(KEY_LOOKUP_CONCURRENCY);
    await Promise.all(
      ids.map(async id => {
        await sema.acquire();
        try {
          const key = await getApiKey(client, id).catch(() => null);
          if (key?.name) {
            names.set(id, key.name);
          }
        } finally {
          sema.release();
        }
      })
    );
    return names;
  }
  const wanted = new Set(ids);
  const seen = new Set<string>();
  let next: string | undefined;
  try {
    for (let pages = 0; pages < KEY_ROSTER_MAX_PAGES; pages++) {
      const page = await listApiKeysPage(client, {
        limit: KEY_ROSTER_PAGE_SIZE,
        next,
      });
      for (const key of page.items) {
        if (wanted.delete(key.id) && key.name) {
          names.set(key.id, key.name);
        }
      }
      // Names are best-effort: a repeated cursor ends the lookup, not the command.
      if (!page.next || wanted.size === 0 || seen.has(page.next)) {
        break;
      }
      seen.add(page.next);
      next = page.next;
    }
  } catch {}
  return names;
}

// One concurrent pass per name source; every lookup degrades to the scope id.
async function resolveScopeNames(
  client: Client,
  configured: Budget[]
): Promise<string[]> {
  const ids = (scopeType: Budget['scopeType']) => [
    ...new Set(
      configured.filter(b => b.scopeType === scopeType).map(b => b.scopeId)
    ),
  ];
  // The gateway prefixes user scope ids with `usr_`; the roster uses bare ids.
  const userIds = ids('user').map(id => id.replace(/^usr_/, ''));
  const unnamedKeyIds = [
    ...new Set(
      configured
        .filter(b => b.scopeType === 'api-key' && !b.name)
        .map(b => b.scopeId)
    ),
  ];

  const directory = await resolveDirectoryLabels(client, {
    keyIds: unnamedKeyIds,
    userIds,
  });
  const directoryAnswered = directory !== DIRECTORY_SKIPPED;
  const apiKeyNames = new Map<string, string>();
  for (const [id, key] of directory.keys) {
    if (key.name) {
      apiKeyNames.set(id, key.name);
    }
  }
  const members = new Map<string, TeamMember>();
  for (const [uid, label] of directory.users ?? []) {
    members.set(uid, { uid, username: label.username, name: label.name });
  }
  const leftoverKeyIds = unnamedKeyIds.filter(id => !apiKeyNames.has(id));
  const leftoverUserIds =
    directory.users === null
      ? userIds
      : userIds.filter(uid => !members.has(uid));

  const [legacyKeyNames, legacyMembers, projects, teams] = await Promise.all([
    resolveApiKeyNames(client, leftoverKeyIds, { directoryAnswered }),
    leftoverUserIds.length
      ? getTeamMembersByIds(
          client,
          client.config.currentTeam as string,
          leftoverUserIds
        ).catch(() => new Map<string, TeamMember>())
      : new Map<string, TeamMember>(),
    Promise.all(
      ids('project').map(async id => {
        const project = await getProjectByNameOrId(client, id).catch(
          () => null
        );
        const name =
          project && !(project instanceof ProjectNotFound)
            ? project.name
            : undefined;
        return [id, name || id] as const;
      })
    ),
    Promise.all(
      ids('team').map(async id => {
        const team = await getTeamByIdOrSlug(client, id).catch(() => null);
        return [id, team?.slug || team?.name || id] as const;
      })
    ),
  ]);

  const projectNames = new Map(projects);
  const teamNames = new Map(teams);
  for (const [id, name] of legacyKeyNames) {
    apiKeyNames.set(id, name);
  }
  for (const [uid, member] of legacyMembers) {
    members.set(uid, member);
  }

  return configured.map(budget => {
    switch (budget.scopeType) {
      case 'team':
        return teamNames.get(budget.scopeId) || budget.scopeId;
      case 'project':
        return projectNames.get(budget.scopeId) || budget.scopeId;
      case 'user': {
        const member = members.get(budget.scopeId.replace(/^usr_/, ''));
        return member ? teamMemberLabel(member) : budget.scopeId;
      }
      default:
        return budget.name || apiKeyNames.get(budget.scopeId) || budget.scopeId;
    }
  });
}

// "applied to" counts inheriting entities with spend; rows materialize on
// first spend, so never-used entities aren't counted.
function defaultRows(
  defaults: ScopeBudgetDefault[],
  counts: DefaultCoveredCounts,
  filter?: BudgetSetScopeType
) {
  return BUDGET_DEFAULT_SCOPE_TYPES.flatMap(scopeType => {
    if (filter && scopeType !== filter) {
      return [];
    }
    const row = defaults.find(
      d => d.scopeType === scopeType && d.active !== false
    );
    if (!row) {
      return [];
    }
    const applied = counts[scopeType] ?? 0;
    const covered = BUDGET_DEFAULT_COVERED[scopeType];
    const noun =
      applied === 1
        ? covered.toLowerCase().replace(/s$/, '')
        : covered.toLowerCase();
    return [
      [
        scopeType,
        `$${row.limitAmount}`,
        row.refreshPeriod,
        `${applied} ${noun}`,
      ],
    ];
  });
}

// The --defaults view: the team's default policy as the primary output.
async function listDefaults(
  client: Client,
  {
    scopeType,
    asJson,
  }: { scopeType: BudgetSetScopeType | undefined; asJson: boolean }
) {
  output.spinner('Fetching budget defaults…');

  let counts: DefaultCoveredCounts;
  let defaults: ScopeBudgetDefault[];
  try {
    [counts, defaults] = await Promise.all([
      asJson ? {} : fetchDefaultCoveredCounts(client, scopeType),
      listScopeBudgetDefaults(client),
    ]);
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  output.stopSpinner();

  // JSON is a faithful passthrough of the API rows (scope-filtered only),
  // matching the old `defaults list --format json` contract; the table view
  // shows active rows.
  const policyRows = defaults.filter(
    d =>
      BUDGET_DEFAULT_SCOPE_TYPES.includes(
        d.scopeType as BudgetDefaultScopeType
      ) &&
      (scopeType === undefined || d.scopeType === scopeType)
  );

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ defaults: policyRows }, null, 2)}\n`
    );
    return 0;
  }

  const rows = defaultRows(defaults, counts, scopeType);

  if (rows.length === 0) {
    output.log(
      scopeType
        ? `No ${scopeType} budget default set. Set one with ${getCommandName(`ai-gateway budgets set ${scopeType} --default`)}.`
        : `No budget defaults set. Set one with ${getCommandName('ai-gateway budgets set <scope> --default')}.`
    );
    return 0;
  }

  output.log('Budget defaults');
  client.stdout.write(
    `${table(
      [
        ['default', 'limit', 'refresh', 'applied to'].map(header =>
          chalk.gray(header)
        ),
        ...rows,
      ],
      { align: ['l', 'r', 'l', 'l'], hsep: 4 }
    ).replace(/^/gm, '  ')}\n`
  );
  return 0;
}

// A one-row page carries the counts across the full list.
async function fetchDefaultCoveredCounts(
  client: Client,
  scopeType: BudgetSetScopeType | undefined
): Promise<DefaultCoveredCounts> {
  const page = await listBudgetsPage(client, {
    scopeType,
    limit: 1,
    includeDefaultCovered: false,
  });
  return page.defaultCoveredCounts;
}

function printDefaultsSection(
  defaults: ScopeBudgetDefault[],
  counts: DefaultCoveredCounts,
  filter?: BudgetSetScopeType
) {
  const rows = defaultRows(defaults, counts, filter);
  if (rows.length === 0) {
    return;
  }
  output.log('Scopes without their own budget inherit the following defaults:');
  output.print(
    `${table(
      [
        ['default', 'limit', 'refresh', 'applied to'].map(header =>
          chalk.gray(header)
        ),
        ...rows,
      ],
      { align: ['l', 'r', 'l', 'l'], hsep: 4 }
    ).replace(/^/gm, '  ')}\n`
  );
}

function printBudgetsTable(budgets: Budget[], names: string[]) {
  return `${table(
    [
      ['scope', 'name', 'limit', 'spent', 'refresh'].map(header =>
        chalk.gray(header)
      ),
      ...budgets.map((budget, i) => [
        budget.scopeType,
        names[i],
        `$${budget.limitAmount}`,
        `$${budget.currentSpend.toFixed(2)}`,
        budget.refreshPeriod,
      ]),
    ],
    { align: ['l', 'l', 'r', 'r', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
