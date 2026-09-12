import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  listBudgets,
  listScopeBudgetDefaults,
  BUDGET_DEFAULT_SCOPE_TYPES,
  BUDGET_DEFAULT_COVERED,
  type Budget,
  type ScopeBudgetDefault,
} from '../../util/ai-gateway/budgets';
import { listApiKeys } from '../../util/ai-gateway/api-keys';
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
    return 1;
  }
  const { flags: opts } = parsedArgs;

  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (!(await ensureTeam(client))) {
    return 1;
  }

  output.spinner('Fetching budgets…');

  let budgets: Budget[];
  let defaults: ScopeBudgetDefault[];
  try {
    [budgets, defaults] = await Promise.all([
      listBudgets(client),
      asJson
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

  if (asJson) {
    output.stopSpinner();
    client.stdout.write(`${JSON.stringify({ budgets }, null, 2)}\n`);
    return 0;
  }

  const configured = budgets.filter(budget => !budget.source);

  if (configured.length === 0) {
    output.stopSpinner();
    output.log(
      `No budgets found. Set one with ${getCommandName('ai-gateway budgets set')}.`
    );
    printDefaultsSection(defaults, budgets);
    return 0;
  }

  const names = await resolveScopeNames(client, configured);

  output.stopSpinner();

  printDefaultsSection(defaults, budgets);
  output.log('Custom budgets');
  client.stdout.write(printBudgetsTable(configured, names));
  return 0;
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
  const needsKeyRoster = configured.some(
    b => b.scopeType === 'api-key' && !b.name
  );

  const [apiKeys, members, projects, teams] = await Promise.all([
    needsKeyRoster ? listApiKeys(client).catch(() => []) : [],
    userIds.length
      ? getTeamMembersByIds(
          client,
          client.config.currentTeam as string,
          userIds
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

  const apiKeyNames = new Map(apiKeys.map(key => [key.id, key.name]));
  const projectNames = new Map(projects);
  const teamNames = new Map(teams);

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
function printDefaultsSection(
  defaults: ScopeBudgetDefault[],
  budgets: Budget[]
) {
  const rows = BUDGET_DEFAULT_SCOPE_TYPES.flatMap(scopeType => {
    const row = defaults.find(
      d => d.scopeType === scopeType && d.active !== false
    );
    if (!row) {
      return [];
    }
    const applied = budgets.filter(
      b => b.source === 'default' && b.scopeType === scopeType
    ).length;
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
  if (rows.length === 0) {
    return;
  }
  output.log(
    `Inherited budgets are listed by ${getCommandName('ai-gateway budgets ls --format json')}. They use the following defaults:`
  );
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
