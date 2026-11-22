import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { help } from '../../../src/args';
import type { Command, CommandOption } from '../../../src/commands/help';
import { commands, commandsStructs } from '../../../src/commands';
import { getRootHelpCommands } from '../../../src/commands/root-help';
import { globalCommandOptions } from '../../../src/util/arg-common';
import {
  getFlagsSpecification,
  getShortFlags,
} from '../../../src/util/get-flags-specification';
import { activityCommand } from '../../../src/commands/activity/command';
import { agentCommand } from '../../../src/commands/agent/command';
import { agentRunsCommand } from '../../../src/commands/agent-runs/command';
import {
  aiGatewayCommand,
  setupSubcommand,
} from '../../../src/commands/ai-gateway/command';
import { alertsCommand } from '../../../src/commands/alerts/command';
import { aliasCommand } from '../../../src/commands/alias/command';
import { apiCommand } from '../../../src/commands/api/command';
import { bisectCommand } from '../../../src/commands/bisect/command';
import { blobCommand } from '../../../src/commands/blob/command';
import { budgetCommand } from '../../../src/commands/budget/command';
import { buildCommand } from '../../../src/commands/build/command';
import { buildersCommand } from '../../../src/commands/builders/command';
import { buyCommand } from '../../../src/commands/buy/command';
import { cacheCommand } from '../../../src/commands/cache/command';
import { certsCommand } from '../../../src/commands/certs/command';
import { changelogCommand } from '../../../src/commands/changelog/command';
import { ciCommand } from '../../../src/commands/ci/command';
import { commentsCommand } from '../../../src/commands/comments/command';
import { connexCommand } from '../../../src/commands/connex/command';
import { contractCommand } from '../../../src/commands/contract/command';
import { cronsCommand } from '../../../src/commands/crons/command';
import { curlCommand } from '../../../src/commands/curl/command';
import { daemonsCommand } from '../../../src/commands/daemons/command';
import { deployCommand } from '../../../src/commands/deploy/command';
import { deployHooksCommand } from '../../../src/commands/deploy-hooks/command';
import { devCommand } from '../../../src/commands/dev/command';
import { dnsCommand } from '../../../src/commands/dns/command';
import { domainsCommand } from '../../../src/commands/domains/command';
import { drainsCommand } from '../../../src/commands/drains/command';
import { envCommand } from '../../../src/commands/env/command';
import { experimentsCommand } from '../../../src/commands/experiments/command';
import { feedbackCommand } from '../../../src/commands/feedback/command';
import { firewallCommand } from '../../../src/commands/firewall/command';
import { flagsCommand } from '../../../src/commands/flags/command';
import { gitCommand } from '../../../src/commands/git/command';
import { globalConfigCommand } from '../../../src/commands/global-config/command';
import { guidanceCommand } from '../../../src/commands/guidance/command';
import { healthCommand } from '../../../src/commands/health/command';
import { httpstatCommand } from '../../../src/commands/httpstat/command';
import { initCommand } from '../../../src/commands/init/command';
import { inspectCommand } from '../../../src/commands/inspect/command';
import { installCommand } from '../../../src/commands/install/command';
import { integrationCommand } from '../../../src/commands/integration/command';
import { integrationResourceCommand } from '../../../src/commands/integration-resource/command';
import { kmsCommand } from '../../../src/commands/kms/command';
import { linkCommand } from '../../../src/commands/link/command';
import { listCommand } from '../../../src/commands/list/command';
import { loginCommand } from '../../../src/commands/login/command';
import { logoutCommand } from '../../../src/commands/logout/command';
import { logsCommand } from '../../../src/commands/logs/command';
import { mcpCommand } from '../../../src/commands/mcp/command';
import { metricsCommand } from '../../../src/commands/metrics/command';
import { monitorsCommand } from '../../../src/commands/monitors/command';
import { microfrontendsCommand } from '../../../src/commands/microfrontends/command';
import { openCommand } from '../../../src/commands/open/command';
import { organizationsCommand } from '../../../src/commands/organizations/command';
import { pricingCommand } from '../../../src/commands/pricing/command';
import { projectCommand } from '../../../src/commands/project/command';
import { promoteCommand } from '../../../src/commands/promote/command';
import { pullCommand } from '../../../src/commands/pull/command';
import { redeployCommand } from '../../../src/commands/redeploy/command';
import { redirectsCommand } from '../../../src/commands/redirects/command';
import { removeCommand } from '../../../src/commands/remove/command';
import { rollbackCommand } from '../../../src/commands/rollback/command';
import { rollingReleaseCommand } from '../../../src/commands/rolling-release/command';
import { routesCommand } from '../../../src/commands/routes/command';
import { sandboxCommand } from '../../../src/commands/sandbox/command';
import { schedulesCommand } from '../../../src/commands/schedules/command';
import { securityCommand } from '../../../src/commands/security/command';
import { setupCommand } from '../../../src/commands/setup/command';
import { signupCommand } from '../../../src/commands/signup/command';
import { skillsCommand } from '../../../src/commands/skills/command';
import { storageCommand } from '../../../src/commands/storage/command';
import { targetCommand } from '../../../src/commands/target/command';
import { teamsCommand } from '../../../src/commands/teams/command';
import { telemetryCommand } from '../../../src/commands/telemetry/command';
import { tokensCommand } from '../../../src/commands/tokens/command';
import {
  tokenPassCommand,
  tokenPassSetupSubcommand,
} from '../../../src/commands/token-pass/command';
import { tracesCommand } from '../../../src/commands/traces/command';
import { upgradeCommand } from '../../../src/commands/upgrade/command';
import { usageCommand } from '../../../src/commands/usage/command';
import { vcrCommand } from '../../../src/commands/vcr/command';
import { versionCommand } from '../../../src/commands/version/command';
import { webhooksCommand } from '../../../src/commands/webhooks/command';
import { whoamiCommand } from '../../../src/commands/whoami/command';

const ROOT_COMMANDS = [
  activityCommand,
  agentCommand,
  agentRunsCommand,
  aiGatewayCommand,
  alertsCommand,
  aliasCommand,
  apiCommand,
  bisectCommand,
  blobCommand,
  budgetCommand,
  buildCommand,
  buildersCommand,
  buyCommand,
  cacheCommand,
  certsCommand,
  changelogCommand,
  ciCommand,
  commentsCommand,
  connexCommand,
  contractCommand,
  cronsCommand,
  curlCommand,
  daemonsCommand,
  deployCommand,
  deployHooksCommand,
  devCommand,
  dnsCommand,
  domainsCommand,
  drainsCommand,
  envCommand,
  experimentsCommand,
  feedbackCommand,
  firewallCommand,
  flagsCommand,
  gitCommand,
  globalConfigCommand,
  guidanceCommand,
  healthCommand,
  httpstatCommand,
  initCommand,
  inspectCommand,
  installCommand,
  integrationCommand,
  integrationResourceCommand,
  kmsCommand,
  linkCommand,
  listCommand,
  loginCommand,
  logoutCommand,
  logsCommand,
  mcpCommand,
  metricsCommand,
  monitorsCommand,
  microfrontendsCommand,
  openCommand,
  organizationsCommand,
  pricingCommand,
  projectCommand,
  promoteCommand,
  pullCommand,
  redeployCommand,
  redirectsCommand,
  removeCommand,
  rollbackCommand,
  rollingReleaseCommand,
  routesCommand,
  sandboxCommand,
  schedulesCommand,
  securityCommand,
  setupCommand,
  signupCommand,
  skillsCommand,
  storageCommand,
  targetCommand,
  teamsCommand,
  telemetryCommand,
  tokensCommand,
  tokenPassCommand,
  tracesCommand,
  upgradeCommand,
  usageCommand,
  vcrCommand,
  versionCommand,
  webhooksCommand,
  whoamiCommand,
] as const satisfies readonly Command[];

interface CommandNode {
  command: Command;
  path: string;
}

function flattenCommands(
  command: Command,
  parentPath: readonly string[] = []
): CommandNode[] {
  const pathParts = [...parentPath, command.name];
  return [
    { command, path: pathParts.join(' ') },
    ...(command.subcommands ?? []).flatMap(subcommand =>
      flattenCommands(subcommand, pathParts)
    ),
  ];
}

const COMMANDS = ROOT_COMMANDS.flatMap(command => flattenCommands(command));

function optionFor(command: Command, name: string): CommandOption | undefined {
  return command.options.find(option => option.name === name);
}

function hasBooleanJson(command: Command): boolean {
  return optionFor(command, 'json')?.type === Boolean;
}

function expectAllowlist(
  actual: Iterable<string>,
  allowlist: Readonly<Record<string, string>>
) {
  expect([...actual].sort()).toEqual(Object.keys(allowlist).sort());
  for (const [path, reason] of Object.entries(allowlist)) {
    expect(reason, `${path} needs a non-empty exception reason`).not.toBe('');
  }
}

// `--json` is the only documented way to ask for JSON. A command keeps
// `--format` only as a hidden alias next to a Boolean `--json`.
const FORMAT_EXCEPTIONS = {
  'ai-gateway leaderboard apps':
    'Supports table, JSON, and CSV through --format',
  'ai-gateway leaderboard labs':
    'Supports table, JSON, and CSV through --format',
  'ai-gateway leaderboard models':
    'Supports table, JSON, and CSV through --format',
  'ai-gateway leaderboard providers':
    'Supports table, JSON, and CSV through --format',
  'ai-gateway budgets defaults list': 'Hidden command without --json yet',
  'ai-gateway budgets defaults remove': 'Hidden command without --json yet',
  'ai-gateway budgets defaults set': 'Hidden command without --json yet',
  'blob put-image': '--format picks the image type, not the output',
  'experiments analyze': 'Hidden command without --json yet',
  'experiments create': 'Hidden command without --json yet',
  'experiments decide': 'Hidden command without --json yet',
  'experiments delete': 'Hidden command without --json yet',
  'experiments diagnose': 'Hidden command without --json yet',
  'experiments inspect': 'Hidden command without --json yet',
  'experiments list': 'Hidden command without --json yet',
  'experiments reseed-enrollment': 'Hidden command without --json yet',
  'experiments restart-analysis': 'Hidden command without --json yet',
  'experiments return-to-draft': 'Hidden command without --json yet',
  'experiments set-ramp': 'Hidden command without --json yet',
  'experiments start': 'Hidden command without --json yet',
  'experiments update': 'Hidden command without --json yet',
  skills:
    '--format is a supported but currently undocumented compatibility path',
} as const satisfies Readonly<Record<string, string>>;

const JSON_SHAPE_EXCEPTIONS = {
  'firewall rules add': '--json is the hidden old name of the --data payload',
  'firewall rules update':
    '--json is the hidden old name of the --data payload',
} as const satisfies Readonly<Record<string, string>>;

const PROJECT_SHAPE_EXCEPTIONS = {
  'agent-runs inspect': 'Uses the NAME|ID placeholder',
  'agent-runs list': 'Uses the NAME|ID placeholder',
  'agent-runs trace': 'Uses the NAME|ID placeholder',
  mcp: '--project is Boolean and means project-scoped setup',
  'microfrontends create-group': 'Accepts repeatable project names',
  'traces inspect': 'Uses the NAME|ID placeholder',
  'webhooks create': 'Accepts only a project ID and can be repeated',
} as const satisfies Readonly<Record<string, string>>;

/**
 * Metadata cannot tell us whether a prompt is safe to bypass. Keep known
 * prompt-without---yes cases explicit so fixing one makes this allowlist stale.
 * Command-level tests must still cover the actual TTY/non-interactive behavior.
 */
const PROMPT_WITHOUT_YES_EXCEPTIONS = {
  'domains buy':
    '--amount set to the price a person approved is the consent for this charge',
  'domains renew':
    '--amount set to the price a person approved is the consent for this charge',
  'domains transfer-in': 'Paid ownership transfer needs command-specific proof',
  'microfrontends add-to-group':
    'Billing-impacting mutation intentionally rejects non-interactive use',
  'project pause':
    'Pausing production traffic requires interactive typed confirmation',
  'rolling-release update':
    'Known gap: fully specified configuration still asks for confirmation',
} as const satisfies Readonly<Record<string, string>>;

const OPTION_NAME_EXCEPTIONS = {
  'rolling-release approve --currentStageIndex':
    'Existing camelCase compatibility flag',
} as const satisfies Readonly<Record<string, string>>;

// Names the guide's standard options and selectors never use. `--query`
// searches, `--<field>` filters, `--limit` sizes results, `--amount` is
// money, `--force` replaces, `--meta` is metadata, `--output` writes a file,
// `--billing-plan` picks a plan, and the global `--scope` picks a team.
const NEVER_OPTION_NAMES = new Set([
  'search',
  'filter',
  'overwrite',
  'allow-overwrite',
  'top',
  'count',
  'metadata',
  'plan',
  'budget',
  'out',
  'team',
]);

// Shown options that still use one of those names, or a selector that ends
// in `-id`.
const NEVER_OPTION_NAME_EXCEPTIONS = {
  'blob presign --allow-overwrite':
    'A permission inside the signed URL, not the CLI replacing a blob',
  'certs issue --overwrite':
    'Always fails as deprecated; hiding it is a separate change',
  'deploy describe --aws-account-id':
    'An AWS account number, not a Vercel resource selector',
  'kms import --key-id': 'Sets the JWKS kid value; not a selector',
  'kms import-key --key-id': 'Sets the JWKS kid value; not a selector',
  'monitors notifications link --slack-installation-id':
    'Monitors options are renamed in their own change',
  'monitors notifications unlink --slack-installation-id':
    'Monitors options are renamed in their own change',
  'monitors notifications update --slack-installation-id':
    'Monitors options are renamed in their own change',
} as const satisfies Readonly<Record<string, string>>;

// Time ranges use -s, --since and -u, --until. These options take a single
// point in time, not a range.
const TIME_RANGE_NAME_EXCEPTIONS = {
  'ai-gateway leaderboard labs --date':
    'Selects one day of the table view, not a range',
  'ai-gateway leaderboard models --date':
    'Selects one day of the table view, not a range',
  'flags rollout --start': 'Schedules when a rollout begins, not a range',
  'flags rules add --start': 'Schedules when a rollout begins, not a range',
  'flags rules update --start': 'Schedules when a rollout begins, not a range',
} as const satisfies Readonly<Record<string, string>>;

const LEGACY_TIME_RANGE_NAMES: Readonly<Record<string, 'since' | 'until'>> = {
  from: 'since',
  start: 'since',
  date: 'since',
  to: 'until',
  end: 'until',
};

/**
 * Subcommands renamed to their registry verb, with the names they replaced.
 * The new name must stay the command's name, and the old names must keep
 * working as aliases, which help never lists.
 */
const RENAMED_SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  // `create` makes a new standalone resource.
  'flags sdk-keys create': ['add'],
  'global-config create': ['add'],
  'kms create': ['add'],
  'project create': ['add'],
  'teams create': ['add'],
  'tokens create': ['add'],
  'vcr create': ['add'],
  // `inspect` shows one item.
  'global-config inspect': ['get'],
  'rolling-release inspect': ['fetch'],
  'schedules inspect': ['get'],
  'storage inspect': ['get'],
  'traces inspect': ['get'],
  'webhooks inspect': ['get'],
  // Monitors are entries in a configuration, so they are added and removed.
  'monitors add': ['create'],
  'monitors remove': ['rm', 'delete'],
  // `update` changes the fields of an existing resource.
  'ai-gateway rules update': ['edit'],
  'ai-gateway virtual-models update': ['edit'],
  'comments update': ['edit'],
  'firewall rules update': ['edit'],
  'rolling-release update': ['configure'],
  'routes update': ['edit'],
  'vcr update': ['config'],
  // `delete` destroys a resource and its data.
  'ai-gateway virtual-models delete': ['remove', 'rm'],
  'blob delete': ['del'],
  'certs delete': ['remove', 'rm'],
  'connect delete': ['remove', 'rm'],
  'deploy-hooks delete': ['remove', 'rm'],
  'flags delete': ['remove', 'rm'],
  'flags entities delete': ['remove', 'rm'],
  'flags segments delete': ['remove', 'rm'],
  'global-config delete': ['remove', 'rm'],
  'integration-resource delete': ['remove', 'rm'],
  'kms delete': ['remove', 'rm'],
  'project delete': ['remove', 'rm'],
  'vcr delete': ['rm', 'remove'],
  'vcr image delete': ['rm', 'remove'],
  'webhooks delete': ['remove', 'rm'],
  // `remove` takes out an entry; the thing it points to stays.
  'flags labels remove': ['rm'],
  'routes remove': ['delete', 'rm'],
  'traces config remove': ['rm', 'delete'],
  'vcr permissions remove': ['rm'],
  // `revoke` invalidates a credential.
  'ai-gateway api-keys revoke': ['remove', 'rm', 'delete'],
  'flags sdk-keys revoke': ['remove', 'rm'],
  'tokens revoke': ['remove', 'rm', 'delete'],
  // `move` changes a position in an ordered list.
  'firewall rules move': ['reorder'],
  'routes move': ['reorder'],
  // `import` reads resources from a file.
  'redirects import': ['upload'],
};

/**
 * Other old names that still run as aliases and print a deprecation warning.
 * The guide accepts only `ls` for `list`, `rm` for `remove` and `delete`,
 * `del` for `delete`, singular group names, and `vercel switch`; any other
 * alias is deprecated. `log` and `addons` look like singular and plural
 * names, but `logs` and `buy addon` aren't groups, so they warn too.
 */
const DEPRECATED_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'ai-gateway budgets defaults remove': ['delete'],
  'ai-gateway budgets remove': ['delete'],
  'ai-gateway rules remove': ['delete'],
  alias: ['ln'],
  'blob copy': ['cp'],
  'blob delete': ['remove'],
  'blob list-stores': ['ls-stores'],
  'budgets inspect': ['overview'],
  'budgets remove': ['delete', 'disable'],
  'budgets set': ['update'],
  'buy addon': ['add-on', 'addons'],
  'comments inspect': ['get'],
  'deploy-hooks create': ['add'],
  dev: ['develop'],
  environments: ['targets', 'target'],
  'firewall ip-blocks unblock': ['rm'],
  'firewall rules remove': ['delete'],
  'flags create': ['add'],
  'flags entities create': ['add'],
  'flags segments create': ['add'],
  'global-config': ['edge-config'],
  health: ['status-page'],
  install: ['i'],
  'integration add': ['install'],
  'integration resource delete': ['remove'],
  'integration resource inspect': ['status'],
  'integration-resource': ['ir'],
  'integration-resource inspect': ['status'],
  'kms inspect': ['get'],
  'kms remove-grant': ['rm-grant', 'delete-grant'],
  logs: ['log'],
  microfrontends: ['mf'],
  'monitors inspect': ['get'],
  'monitors notifications update': ['patch'],
  'monitors update': ['patch'],
  'project access-groups': ['accessgroups'],
  'project access-summary': ['summary'],
  'project priority': ['priority-project'],
  'project resume': ['unpause'],
  'project update': ['set'],
  'redirects list-versions': ['ls-versions'],
  'rolling-release': ['rr'],
  'routes list-versions': ['ls-versions'],
  'teams request': ['access-request'],
  'teams switch': ['change'],
  'token-pass': ['tokenpass'],
  'vcr image inspect': ['get'],
  'vcr inspect': ['get'],
  'vcr tag inspect': ['get'],
  'version update': ['upgrade'],
  'version use': ['switch', 'install'],
  'webhooks create': ['add'],
};

// Commands still named `ls`, with `list` as their alias. They switch when
// `list` becomes their name. This list may only shrink.
const LS_NAME_EXCEPTIONS = {
  'activity ls (list)': 'Renamed to list in a later change',
  'alerts ls (list)': 'Renamed to list in a later change',
  'flags labels ls (list)': 'Renamed to list in a later change',
  'monitors ls (list)': 'Renamed to list in a later change',
  'monitors notifications ls (list)': 'Renamed to list in a later change',
  'traces config ls (list)': 'Renamed to list in a later change',
  'vcr image ls (list)': 'Renamed to list in a later change',
  'vcr ls (list)': 'Renamed to list in a later change',
  'vcr permissions ls (list)': 'Renamed to list in a later change',
  'vcr tag ls (list)': 'Renamed to list in a later change',
} as const satisfies Readonly<Record<string, string>>;

/** Whether the guide accepts `alias` for the command at `path` for good. */
function isGuideAlias(path: string, name: string, alias: string): boolean {
  if (alias === 'ls') return name === 'list';
  if (alias === 'rm') return name === 'remove' || name === 'delete';
  if (alias === 'del') return name === 'delete';
  // `vercel switch` is the shortcut for `vercel teams switch`.
  if (path === 'teams' && alias === 'switch') return true;
  // A singular group name behaves exactly like its plural.
  return (
    [`${alias}s`, `${alias}es`].includes(name) ||
    [`${name}s`, `${name}es`].includes(alias)
  );
}

/**
 * Options renamed to their standard name, with the name they replaced. The
 * old name must keep working as a deprecated option, which help hides.
 */
const RENAMED_OPTIONS: Readonly<Record<string, string>> = {
  'schedules executions list --since': 'from',
  'schedules executions list --until': 'to',
  'usage --since': 'from',
  'usage --until': 'to',
  'agent-runs list --next': 'page',
  'blob list --next': 'cursor',
  'flags versions list --next': 'cursor',
  'redirects list --next': 'page',
  'vcr image ls --next': 'cursor',
  'vcr ls --next': 'cursor',
  'vcr permissions ls --next': 'cursor',
  'vcr tag ls --next': 'cursor',
  // `--environment` chooses an environment.
  'build --environment': 'target',
  'deploy --environment': 'target',
  'deploy init --environment': 'target',
  'redeploy --environment': 'target',
  'list --environment': 'prod',
  'metrics --environment': 'prod',
  'pull --environment': 'prod',
  // `--deployment` points to one deployment.
  'build --deployment': 'id',
  'deploy continue --deployment': 'id',
  'deploy describe --deployment': 'id',
  'env pull --deployment': 'id',
  'microfrontends pull --deployment': 'dpl',
  'rolling-release abort --deployment': 'dpl',
  'rolling-release approve --deployment': 'dpl',
  'rolling-release complete --deployment': 'dpl',
  'rolling-release start --deployment': 'dpl',
  'traces search --deployment': 'deployment-id',
  // `--git-branch` names a Git branch.
  'ci list --git-branch': 'branch',
  'ci grep --git-branch': 'branch',
  'comments list --git-branch': 'branch',
  'connect attach --git-branch': 'trigger-branch',
  'connect create --git-branch': 'trigger-branch',
  'deploy-hooks create --git-branch': 'ref',
  // `-q, --query` searches.
  'agent-runs list --query': 'search',
  'comments list --query': 'search',
  'connect list --query': 'search',
  'firewall traffic inspect --query': 'filter',
  'firewall traffic list --query': 'filter',
  'metrics --query': 'filter',
  'project access-groups --query': 'search',
  'project list --query': 'filter',
  'project members --query': 'search',
  'redirects list --query': 'search',
  'routes list --query': 'search',
  // A filter is named for its field.
  'routes list --type': 'filter',
  // `--amount` is money.
  'ai-gateway api-keys create --amount': 'limit',
  'ai-gateway budgets defaults set --amount': 'limit',
  'ai-gateway budgets set --amount': 'limit',
  'ai-gateway coding-agents setup --amount': 'budget',
  'ai-gateway setup --amount': 'budget',
  'token-pass --amount': 'budget',
  'token-pass setup --amount': 'budget',
  // `--force` replaces.
  'blob put --force': 'allow-overwrite',
  'blob put-image --force': 'allow-overwrite',
  'redirects import --force': 'overwrite',
  // `--limit` sizes results.
  'firewall traffic inspect --limit': 'top',
  'firewall traffic list --limit': 'top',
  'routes list-versions --limit': 'count',
  // Integration options.
  'install --meta': 'metadata',
  'integration add --meta': 'metadata',
  'install --billing-plan': 'plan',
  'integration add --billing-plan': 'plan',
  'integration update --billing-plan': 'plan',
  'connect token --installation': 'installation-id',
  'install --installation': 'installation-id',
  'integration add --installation': 'installation-id',
  'integration update --installation': 'installation-id',
  'integration update --authorization': 'authorization-id',
  // A selector never ends in `-id`.
  'blob --store': 'store-id',
  'comments list --content': 'content-id',
  'flags list --maintainer': 'maintainer-id',
  'schedules executions list --execution': 'execution-id',
  'traces search --span': 'span-id',
  'traces search --trace': 'trace-id',
  // A version is `--<noun>-version`.
  'redirects list --redirects-version': 'version',
  'routes list --routes-version': 'version-id',
  // `-o, --output` writes a file.
  'ai-gateway leaderboard apps --output': 'out',
  'ai-gateway leaderboard labs --output': 'out',
  'ai-gateway leaderboard models --output': 'out',
  'ai-gateway leaderboard providers --output': 'out',
  // An on/off setting is `--x` / `--no-x`.
  'ai-gateway rules update --no-enable': 'disable',
  'firewall rules add --no-enable': 'disabled',
  'firewall rules update --enable': 'enabled',
  'firewall rules update --no-enable': 'disabled',
  'rolling-release update --no-enable': 'disable',
  'routes add --no-enable': 'disabled',
  'upgrade --autoupdate': 'enable-auto',
  'upgrade --no-autoupdate': 'disable-auto',
  'upgrade --no-bypass-min-release-age': 'disable-min-release-age-bypass',
};

// An on/off setting is a presence flag: `--x` and `--no-x`, never `--enabled`,
// `--disabled`, `--disable`, or `--enable-x` / `--disable-x`.
const ON_OFF_OPTION_NAME = /^(enabled|disabled|disable)$|^(enable|disable)-/;

// A Boolean option takes no value, so help shows no value hint for it.
const BOOLEAN_HINT_EXCEPTIONS = {
  'bisect --open': 'Known gap: help shows <URL> on a presence flag',
} as const satisfies Readonly<Record<string, string>>;

// Names a Git branch: `--git-branch`, or an old name now hidden behind it.
function isGitBranchOption(option: CommandOption): boolean {
  return (
    option.type !== Boolean &&
    (option.argument === 'BRANCH' ||
      option.name === 'ref' ||
      /(^|-)branch$/.test(option.name))
  );
}

// An environment is chosen with -e, --environment <ENVIRONMENT>.
const ENVIRONMENT_SHORTHAND_EXCEPTIONS = {
  deploy: '`-e` is still the deprecated short form of `--env`',
  'deploy init': '`-e` is still the deprecated short form of `--env`',
} as const satisfies Readonly<Record<string, string>>;

// The only short flags, each with one meaning everywhere. Other letters stay
// only as hidden, deprecated short forms (`deprecatedShorthand`).
const GUIDE_SHORT_FLAGS: Readonly<Record<string, string>> = {
  h: 'help',
  v: 'version',
  d: 'debug',
  t: 'token',
  S: 'scope',
  A: 'local-config',
  Q: 'global-config',
  a: 'all',
  e: 'environment',
  f: 'follow',
  n: 'limit',
  o: 'output',
  p: 'project',
  q: 'query',
  s: 'since',
  u: 'until',
  y: 'yes',
};

// Shown short flags outside the guide's table. `vercel api` mirrors `gh api`
// and is the guide's one exception, so it isn't listed.
const SHORT_FLAG_EXCEPTIONS = {} as const satisfies Readonly<
  Record<string, string>
>;

// Options named for a guide letter that don't show it yet.
const MISSING_GUIDE_LETTER_EXCEPTIONS = {
  'dev --project':
    '-p is still the hidden short form of --port until the next major.',
  'flags rules add --project':
    '-p is still the hidden short form of --position until the next major.',
  'flags rules move --project':
    '-p is still the hidden short form of --position until the next major.',
  'mcp --project': '--project is a Boolean here, not a project name.',
  'metrics --all':
    '-a is still the hidden short form of --aggregation until the next major.',
} as const satisfies Readonly<Record<string, string>>;

// A destructive or severe command takes `--all` spelled out. Commands named
// for one are found by name; these change many things at once without one.
const DESTRUCTIVE_COMMAND_NAME =
  /^(delete|remove|revoke|disconnect|empty|purge|dangerously-.+)$/;
const NEVER_ALL_SHORTHAND = {
  'project resume': 'Resumes every paused project in the team',
} as const satisfies Readonly<Record<string, string>>;

function isDestructive({ command, path }: CommandNode): boolean {
  return (
    [command.name, ...command.aliases].some(name =>
      DESTRUCTIVE_COMMAND_NAME.test(name)
    ) || path in NEVER_ALL_SHORTHAND
  );
}

// Hidden letters that are also global short flags. The global option reads
// them first, unless the root parse and the flags routers leave them to the
// command (see `findCommandShorthands`).
const GLOBAL_LETTER_EXCEPTIONS = {
  'blob copy -t --content-type':
    '-t stays --token, and its error points to --content-type. It goes in the next major.',
  'blob put -t --content-type':
    '-t stays --token, and its error points to --content-type. It goes in the next major.',
  'flags create -d --description':
    'Left to the command after its required arguments, with a value.',
  'flags create -v --variant':
    '-v stays --version: some -v forms exit 0 today. It goes in the next major.',
  'flags disable -v --variant':
    '-v stays --version: some -v forms exit 0 today. It goes in the next major.',
  'flags rules add -v --variant':
    '-v stays --version: some -v forms exit 0 today. It goes in the next major.',
  'flags rules update -v --variant':
    '-v stays --version: some -v forms exit 0 today. It goes in the next major.',
  'flags segments create -d --description':
    'Left to the command after its required arguments, with a value.',
  'flags segments update -d --description':
    'Left to the command after its required arguments, with a value.',
  'flags set -v --variant':
    '-v stays --version: some -v forms exit 0 today. It goes in the next major.',
  'flags targets add -v --variant':
    '-v stays --version: some -v forms exit 0 today. It goes in the next major.',
  'flags update -v --variant':
    '-v stays --version: some -v forms exit 0 today. It goes in the next major.',
} as const satisfies Readonly<Record<string, string>>;

// `--target` is the deprecated name of `--environment`.
const TARGET_OPTION_EXCEPTIONS = {
  'connect create --target': "Selects a service's product, not an environment",
  'connect discover --target':
    "Filters by a service's product, not an environment",
} as const satisfies Readonly<Record<string, string>>;

// Old names for `--deployment`. They may only stay as hidden aliases.
const LEGACY_DEPLOYMENT_OPTIONS = new Set(['dpl', 'id', 'deployment-id']);

// An argument that points to a deployment is named `deployment`.
const DEPLOYMENT_ARGUMENT_EXCEPTIONS = {
  remove:
    'Takes a project name or a deployment, which the remove-verbs work settles',
} as const satisfies Readonly<Record<string, string>>;

// Showing one item is `inspect`, never `get` or `fetch`.
const GET_NAME_EXCEPTIONS = {
  'blob get': 'Downloads the blob contents instead of showing its details',
} as const satisfies Readonly<Record<string, string>>;

/**
 * Commands currently lacking a Boolean --json output flag. Keep this inventory
 * exact: a new command without --json must be reviewed, and adding --json to an
 * existing command must remove its entry here. Command groups are included
 * because some also execute when invoked without a subcommand. This audits
 * local metadata, not externally delegated command trees such as sandbox.
 */
const MISSING_JSON_EXCEPTIONS = [
  'activity ls',
  'agent',
  'agent-runs',
  'ai-gateway',
  'ai-gateway api-keys',
  'ai-gateway api-keys create',
  'ai-gateway budgets',
  'ai-gateway budgets defaults',
  'ai-gateway budgets defaults list',
  'ai-gateway budgets defaults set',
  'ai-gateway budgets defaults remove',
  'ai-gateway rules',
  'ai-gateway virtual-models',
  'ai-gateway setup',
  // The older spelling of `ai-gateway setup`.
  'ai-gateway coding-agents',
  'ai-gateway coding-agents setup',
  'ai-gateway models',
  'ai-gateway leaderboard',
  'ai-gateway leaderboard models',
  'ai-gateway leaderboard labs',
  'ai-gateway leaderboard apps',
  'ai-gateway leaderboard providers',
  'alerts ls',
  'alias',
  'alias remove',
  'alias set',
  'api',
  'bisect',
  'blob',
  'blob put',
  'blob get',
  'blob delete',
  'blob copy',
  'blob create-store',
  'blob delete-store',
  'blob get-store',
  'blob empty-store',
  'budgets',
  'build',
  'builders',
  'builders preinstall',
  'buy',
  'cache',
  'cache purge',
  'cache invalidate',
  'cache dangerously-delete',
  'certs',
  'certs add',
  'certs issue',
  'certs delete',
  'ci', // Help-only command group; JSON output belongs to `ci list`.
  'comments',
  'comments open',
  'connect',
  'connect contacts',
  'crons',
  'crons add',
  'crons run',
  'daemons', // Command group; JSON output belongs to its subcommands.
  'drains', // Command group; JSON output belongs to its subcommands.
  'daemons instances', // Command group; JSON output belongs to its subcommands.
  'deploy continue',
  'deploy-hooks',
  'deploy-hooks create',
  'deploy-hooks delete',
  'dev',
  'dns',
  'dns add',
  'dns import',
  'dns remove',
  'dns update',
  'domains',
  'domains add',
  'domains move',
  'domains transfer-in',
  'domains remove',
  'env',
  'env add',
  'env pull',
  'env remove',
  'env run',
  'env update',
  'environments',
  'experiments',
  'experiments list',
  'experiments inspect',
  'experiments create',
  'experiments update',
  'experiments start',
  'experiments set-ramp',
  'experiments restart-analysis',
  'experiments reseed-enrollment',
  'experiments return-to-draft',
  'experiments decide',
  'experiments analyze',
  'experiments diagnose',
  'experiments open',
  'experiments delete',
  'feedback', // Plain submission receipt; no JSON output mode.
  'firewall',
  'firewall publish',
  'firewall discard',
  'firewall ip-blocks',
  'firewall ip-blocks block',
  'firewall ip-blocks unblock',
  'firewall rules',
  'firewall rules add',
  'firewall rules update',
  'firewall rules enable',
  'firewall rules disable',
  'firewall rules remove',
  'firewall rules move',
  'firewall system-bypass',
  'firewall system-bypass add',
  'firewall system-bypass remove',
  'firewall attack-mode',
  'firewall attack-mode enable',
  'firewall attack-mode disable',
  'firewall system-mitigations',
  'firewall system-mitigations pause',
  'firewall system-mitigations resume',
  'firewall alerts',
  'firewall persistent-actions',
  'firewall traffic',
  'flags',
  'flags versions',
  'flags create',
  'flags open',
  'flags update',
  'flags set',
  'flags targeting',
  'flags targeting enable',
  'flags use-targeting',
  'flags split',
  'flags rollout',
  'flags delete',
  'flags archive',
  'flags unarchive',
  'flags disable',
  'flags enable',
  'flags rules',
  'flags rules add',
  'flags rules update',
  'flags rules remove',
  'flags rules move',
  'flags targets',
  'flags segments',
  'flags segments delete',
  'flags entities',
  'flags entities delete',
  'flags labels',
  'flags sdk-keys',
  'flags sdk-keys create',
  'flags sdk-keys revoke',
  'flags connections',
  'flags connections add',
  'flags connections remove',
  'flags prepare',
  'flags override',
  'git',
  'git connect',
  'git disconnect',
  'global-config',
  'guidance',
  'guidance enable',
  'guidance disable',
  'guidance status',
  'httpstat',
  'init',
  'integration',
  'integration guide',
  'integration resource',
  'integration resource create-threshold',
  'integration-resource',
  'integration-resource create-threshold',
  'kms',
  'kms delete',
  'kms revoke-key',
  'kms remove-grant',
  'link',
  'link add',
  'login',
  'logout',
  'mcp',
  'metrics query',
  'microfrontends',
  'microfrontends create-group',
  'microfrontends add-to-group',
  'microfrontends remove-from-group',
  'microfrontends delete-group',
  'microfrontends pull',
  'open',
  'organizations',
  'organizations teams',
  'project',
  'project create',
  'project rename',
  'project delete',
  'project dangerously-delete-immutable-static-asset',
  'promote',
  'promote status',
  'pull',
  'redeploy',
  'redirects',
  'redirects add',
  'redirects import',
  'redirects remove',
  'redirects promote',
  'redirects restore',
  'remove',
  'rollback',
  'rollback status',
  'rolling-release',
  'rolling-release start',
  'rolling-release approve',
  'rolling-release abort',
  'rolling-release complete',
  'routes',
  'routes add',
  'routes update',
  'routes remove',
  'routes enable',
  'routes disable',
  'routes move',
  'routes export',
  'routes publish',
  'routes restore',
  'routes discard-staging',
  'sandbox',
  'schedules',
  'schedules executions',
  'security',
  'setup',
  // Same steps as `setup --plugin`/`--gateway`; machine output comes from --non-interactive.
  'setup plugin',
  'setup gateway',
  'signup',
  'storage',
  'storage delete',
  'teams',
  'teams create',
  'teams invite',
  'teams switch',
  'telemetry',
  'telemetry enable',
  'telemetry disable',
  'telemetry flush',
  'tokens',
  'traces',
  'traces config',
  'vcr',
  'vcr build',
  'vcr push',
  'vcr tag',
  'vcr image',
  'vcr permissions',
  'version',
  'version installed',
  'version use',
  'version update',
  'version check',
  'version autoupdate',
  'version autoupdate enable',
  'version autoupdate disable',
  'version autoupdate status',
  'webhooks',
  'webhooks create',
  'webhooks delete',
] as const;

// Help writes a default as `(default: VALUE)`, and puts a default that
// depends on context in words, as in `(default: linked project)`.
const OLD_DEFAULT_FORMS: readonly RegExp[] = [
  // `(default 20)`, `(default off)`, `regex (default)`, `(default, …)`
  /\(default(?!: )/,
  // `[3m]`, `[off]`
  /\[[^\]]+\]\.?$/,
  // `Defaults to timeline.`, `(defaults to the linked project)`
  /\bdefaults? to\b/i,
];

// An option's description also never states its default in a sentence or
// inside another parenthetical.
const OLD_OPTION_DEFAULT_FORMS: readonly RegExp[] = [
  ...OLD_DEFAULT_FORMS,
  // `by default every available finding is listed`
  /\bby default\b/i,
  // `(repeatable; default: ip)`, `edit (write files, default)`, `· default: x`
  /[,;·] default\b/,
  // `Default: temporary (307)`
  /\bDefault: /,
  // `the default when output is piped`, `this is the default`
  /\bthe default when\b|\bis the default\b/,
];

function matchesAny(text: string, forms: readonly RegExp[]) {
  return forms.some(form => form.test(text));
}

describe('horizontal command option uniformity', () => {
  it('audits every registered root command', () => {
    const registered = new Set(commands.values());
    registered.delete('help');
    registered.add('guidance');

    expect(ROOT_COMMANDS.map(command => command.name).sort()).toEqual(
      [...registered].sort()
    );
  });

  it('uses lowercase kebab-case option names', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(option => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(option.name))
        .map(option => `${path} --${option.name}`)
    );

    expectAllowlist(deviations, OPTION_NAME_EXCEPTIONS);
  });

  it("shows no option the guide's standard names replace", () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(
          option =>
            !option.deprecated &&
            (NEVER_OPTION_NAMES.has(option.name) ||
              (option.name.endsWith('-id') && option.name !== 'request-id'))
        )
        .map(option => `${path} --${option.name}`)
    );

    expectAllowlist(deviations, NEVER_OPTION_NAME_EXCEPTIONS);
  });

  it('keeps --format hidden behind a Boolean --json', () => {
    const deviations = COMMANDS.filter(({ command }) => {
      const option = optionFor(command, 'format');
      return (
        option !== undefined && !(option.deprecated && hasBooleanJson(command))
      );
    }).map(({ path }) => path);

    expectAllowlist(deviations, FORMAT_EXCEPTIONS);
  });

  it('requires --json on every command unless explicitly allowlisted', () => {
    // Token Pass is a thin alias of the existing gateway setup contract.
    const missing = new Set(
      COMMANDS.filter(({ command }) => !hasBooleanJson(command)).map(
        ({ path }) =>
          path === 'token-pass' || path === 'token-pass setup'
            ? 'ai-gateway setup'
            : path
      )
    );

    expect(new Set(MISSING_JSON_EXCEPTIONS).size).toBe(
      MISSING_JSON_EXCEPTIONS.length
    );
    expect([...missing].sort()).toEqual([...MISSING_JSON_EXCEPTIONS].sort());
  });

  it('shares gateway setup options with the Token Pass shortcuts', () => {
    const options = setupSubcommand.options.filter(
      option => option.name !== 'token-pass'
    );
    expect(tokenPassCommand.options).toEqual(options);
    expect(tokenPassSetupSubcommand.options).toEqual(options);
  });

  it('keeps --json an unaliased Boolean output flag', () => {
    const deviations = COMMANDS.filter(({ command }) => {
      const option = optionFor(command, 'json');
      return (
        option !== undefined &&
        (option.type !== Boolean ||
          option.shorthand !== null ||
          option.argument !== undefined ||
          option.deprecated ||
          option.description === undefined)
      );
    }).map(({ path }) => path);

    expectAllowlist(deviations, JSON_SHAPE_EXCEPTIONS);
  });

  it('keeps --project a NAME_OR_ID string target', () => {
    const deviations = COMMANDS.filter(({ command }) => {
      const option = optionFor(command, 'project');
      return (
        option !== undefined &&
        (option.type !== String || option.argument !== 'NAME_OR_ID')
      );
    }).map(({ path }) => path);

    expectAllowlist(deviations, PROJECT_SHAPE_EXCEPTIONS);
  });

  it('keeps legacy pagination flags hidden behind canonical replacements', () => {
    const legacyNames = new Set(['cursor', 'page', 'per-page']);

    for (const { command, path } of COMMANDS) {
      for (const option of command.options) {
        if (!legacyNames.has(option.name)) continue;

        expect(option.deprecated, `${path} --${option.name}`).toBe(true);
        if (option.name === 'cursor') {
          expect(optionFor(command, 'next'), path).toBeDefined();
        } else if (option.name === 'per-page') {
          expect(optionFor(command, 'limit'), path).toBeDefined();
        } else {
          expect(
            optionFor(command, 'next') ?? optionFor(command, 'page-path'),
            path
          ).toBeDefined();
        }
      }
    }
  });

  it('keeps every --next a documented CURSOR string with no short flag', () => {
    const commandsWithNext = COMMANDS.filter(({ command }) =>
      optionFor(command, 'next')
    );
    // Guards the check itself: a refactor that loses --next everywhere
    // must not pass it vacuously.
    expect(commandsWithNext.length).toBeGreaterThanOrEqual(42);

    for (const { command, path } of commandsWithNext) {
      const option = optionFor(command, 'next')!;
      expect(option.type, `${path} --next`).toBe(String);
      expect(option.argument, `${path} --next`).toBe('CURSOR');
      expect(option.shorthand, `${path} --next`).toBeNull();
      expect(option.deprecated, `${path} --next`).toBe(false);
      expect(option.description, `${path} --next`).toBeTruthy();
    }
  });

  it('still accepts the hidden -N on every command with --next', () => {
    for (const { command, path } of COMMANDS) {
      if (!optionFor(command, 'next')) continue;
      const spec = getFlagsSpecification(command.options) as Record<
        string,
        unknown
      >;
      expect(spec['-N'], `${path} -N`).toBe('--next');
    }
  });

  it('teaches --next only as the <CURSOR> placeholder in help examples', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.examples
        .flatMap(example =>
          Array.isArray(example.value) ? example.value : [example.value]
        )
        .filter(
          (value: string) =>
            /--next[=\s]/.test(value) && !/--next[=\s]<CURSOR>/.test(value)
        )
        .map((value: string) => `${path}: ${value}`)
    );

    expect(deviations).toEqual([]);
  });

  it('keeps every existing --yes flag Boolean, documented, and available as -y', () => {
    for (const { command, path } of COMMANDS) {
      const option = optionFor(command, 'yes');
      if (!option) continue;

      expect(option.type, path).toBe(Boolean);
      expect(option.shorthand, path).toBe('y');
      expect(option.argument, path).toBeUndefined();
      expect(option.deprecated, path).toBe(false);
      expect(option.description, path).toBeTruthy();
    }
  });

  it('keeps legacy time-range names hidden behind --since and --until', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(option => {
          const canonical = LEGACY_TIME_RANGE_NAMES[option.name];
          return (
            canonical !== undefined &&
            !(option.deprecated && optionFor(command, canonical))
          );
        })
        .map(option => `${path} --${option.name}`)
    );

    expectAllowlist(deviations, TIME_RANGE_NAME_EXCEPTIONS);
  });

  it('chooses an environment with -e, --environment <ENVIRONMENT>', () => {
    const missingShorthand: string[] = [];
    for (const { command, path } of COMMANDS) {
      for (const option of command.options) {
        if (option.deprecated || !/(^|-)environment$/.test(option.name)) {
          continue;
        }
        expect(option.argument, `${path} --${option.name}`).toBe('ENVIRONMENT');
        expect(option.description, `${path} --${option.name}`).toBeTruthy();
        if (option.name === 'environment' && option.shorthand !== 'e') {
          missingShorthand.push(path);
        }
      }
    }
    expectAllowlist(missingShorthand, ENVIRONMENT_SHORTHAND_EXCEPTIONS);
  });

  it('keeps -e for --environment', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(
          option => option.shorthand === 'e' && option.name !== 'environment'
        )
        .map(option => `${path} --${option.name}`)
    );
    expect(deviations).toEqual([]);
  });

  it("shows only the guide's short flags, each with its one meaning", () => {
    const deviations = COMMANDS.filter(
      ({ path }) => path !== 'api' && !path.startsWith('api ')
    ).flatMap(({ command, path }) =>
      command.options
        .filter(
          option =>
            option.shorthand !== null &&
            !option.deprecated &&
            GUIDE_SHORT_FLAGS[option.shorthand] !== option.name
        )
        .map(option => `${path} -${option.shorthand} --${option.name}`)
    );
    expectAllowlist(deviations, SHORT_FLAG_EXCEPTIONS);
  });

  it('gives each short flag, shown or hidden, one option per command', () => {
    for (const { command, path } of COMMANDS) {
      const owners = new Map<string, string>();
      for (const option of command.options) {
        for (const flag of getShortFlags(option)) {
          const owner = owners.get(flag);
          expect(
            owner === undefined || owner === option.name,
            `${path} ${flag} is both --${owner} and --${option.name}`
          ).toBe(true);
          owners.set(flag, option.name);
        }
      }
    }
  });

  it("shows the guide's letter on every option named for one", () => {
    // The command options in the guide's table. Global options, such as
    // `--version`, are read before the command and aren't checked here.
    const globalNames = new Set(
      globalCommandOptions.map(option => option.name as string)
    );
    const letters = new Map(
      Object.entries(GUIDE_SHORT_FLAGS)
        .filter(([, name]) => !globalNames.has(name))
        .map(([letter, name]) => [name, letter])
    );
    const deviations = COMMANDS.flatMap(node =>
      node.command.options
        .filter(option => {
          const letter = letters.get(option.name);
          return (
            letter !== undefined &&
            // `-e` has its own check above.
            option.name !== 'environment' &&
            !option.deprecated &&
            option.shorthand !== letter &&
            // Destructive commands take `--all` spelled out.
            !(option.name === 'all' && isDestructive(node))
          );
        })
        .map(option => `${node.path} --${option.name}`)
    );
    expectAllowlist(deviations, MISSING_GUIDE_LETTER_EXCEPTIONS);
  });

  it('never shows -a on a destructive command', () => {
    const destructive = COMMANDS.filter(isDestructive);
    // Guards the check itself against a name pattern that matches nothing.
    expect(destructive.length).toBeGreaterThanOrEqual(40);
    const deviations = destructive.flatMap(({ command, path }) =>
      command.options
        .filter(option => option.shorthand === 'a' && !option.deprecated)
        .map(option => `${path} -a --${option.name}`)
    );
    expect(deviations).toEqual([]);
  });

  it.each(
    Object.keys(NEVER_ALL_SHORTHAND)
  )('never gives %s --all a short flag', path => {
    const node = COMMANDS.find(candidate => candidate.path === path);
    const option = node && optionFor(node.command, 'all');
    expect(option, `${path} --all`).toBeDefined();
    expect(getShortFlags(option!), `${path} --all`).toEqual([]);
  });

  it('keeps global letters off hidden short flags', () => {
    const globalLetters = new Set(
      globalCommandOptions.flatMap(option => getShortFlags(option))
    );
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(
          option =>
            option.deprecatedShorthand !== undefined &&
            globalLetters.has(`-${option.deprecatedShorthand}`)
        )
        .map(
          option => `${path} -${option.deprecatedShorthand} --${option.name}`
        )
    );
    expectAllowlist(deviations, GLOBAL_LETTER_EXCEPTIONS);
  });

  it('keeps --target hidden behind --environment', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(option => option.name === 'target' && !option.deprecated)
        .map(option => `${path} --${option.name}`)
    );
    expectAllowlist(deviations, TARGET_OPTION_EXCEPTIONS);
  });

  it('names a Git branch with --git-branch <BRANCH>, with no short flag', () => {
    const branchOptions = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(option => !option.deprecated && isGitBranchOption(option))
        .map(option => ({ key: `${path} --${option.name}`, option }))
    );
    // Guards the check itself: it must not pass vacuously.
    expect(branchOptions.length).toBeGreaterThanOrEqual(13);

    for (const { key, option } of branchOptions) {
      expect(option.name, key).toBe('git-branch');
      expect(option.argument, key).toBe('BRANCH');
      expect(option.shorthand, key).toBeNull();
      expect(option.description, key).toBeTruthy();
    }
  });

  it('keeps every old Git branch name hidden behind --git-branch', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(
          option =>
            option.deprecated &&
            isGitBranchOption(option) &&
            !optionFor(command, 'git-branch')
        )
        .map(option => `${path} --${option.name}`)
    );

    expect(deviations).toEqual([]);
  });

  it('never takes a Git branch as a bare argument', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.arguments
        .filter(argument => /(^|-)(git-?)?branch$|^ref$/.test(argument.name))
        .map(argument => `${path} <${argument.name}>`)
    );

    expect(deviations).toEqual([]);
  });

  it('teaches only --git-branch <BRANCH> for a Git branch in help examples', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.examples
        .flatMap(example =>
          Array.isArray(example.value) ? example.value : [example.value]
        )
        .filter(
          (value: string) =>
            /(^|\s)--(branch|ref|trigger-branch)(=|\s|$)/.test(value) ||
            /--git-branch[=\s]<(?!BRANCH>)/.test(value)
        )
        .map((value: string) => `${path}: ${value}`)
    );

    expect(deviations).toEqual([]);
  });

  it('keeps --since and --until documented TIME strings with -s and -u', () => {
    for (const { command, path } of COMMANDS) {
      for (const [name, shorthand] of [
        ['since', 's'],
        ['until', 'u'],
      ] as const) {
        const option = optionFor(command, name);
        if (!option || option.deprecated) continue;

        expect(option.type, `${path} --${name}`).toBe(String);
        expect(option.shorthand, `${path} --${name}`).toBe(shorthand);
        expect(option.argument, `${path} --${name}`).toBe('TIME');
        expect(option.description, `${path} --${name}`).toBeTruthy();
      }
    }
  });

  it('documents known prompt flows that intentionally or currently lack --yes', () => {
    const paths = new Set(COMMANDS.map(node => node.path));
    for (const [path, reason] of Object.entries(
      PROMPT_WITHOUT_YES_EXCEPTIONS
    )) {
      expect(paths.has(path), `${path}: ${reason}`).toBe(true);
      const node = COMMANDS.find(candidate => candidate.path === path);
      expect(
        optionFor(node!.command, 'yes'),
        `${path}: ${reason}`
      ).toBeUndefined();
    }
  });

  // `rm` and `del` are accepted, never taught: `rm` for every `remove` and
  // `delete`, and `del` for every `delete`.
  it('never names a command rm or del', () => {
    expect(
      COMMANDS.filter(({ command }) =>
        ['rm', 'del'].includes(command.name)
      ).map(({ path }) => path)
    ).toEqual([]);
  });

  it.each(
    COMMANDS.filter(({ command }) =>
      ['remove', 'delete'].includes(command.name)
    ).map(({ path, command }) => [path, command] as const)
  )('%s accepts its short aliases', (path, command) => {
    expect(command.aliases, `${path} accepts rm`).toContain('rm');
    if (command.name === 'delete') {
      expect(command.aliases, `${path} accepts del`).toContain('del');
    }
  });

  it.each(
    Object.entries(RENAMED_SUBCOMMANDS)
  )('keeps %s as the name, with its old names as aliases', (path, oldNames) => {
    const node = COMMANDS.find(candidate => candidate.path === path);
    expect(node, `${path} is the command's name`).toBeDefined();

    const parentPath = path.slice(0, path.lastIndexOf(' '));
    const parent = COMMANDS.find(candidate => candidate.path === parentPath);
    const siblingNames = (parent!.command.subcommands ?? []).map(
      subcommand => subcommand.name
    );
    for (const oldName of oldNames) {
      expect(node!.command.aliases, `${path} accepts ${oldName}`).toContain(
        oldName
      );
      expect(
        siblingNames,
        `${parentPath} ${oldName} is not its own command`
      ).not.toContain(oldName);
    }
  });

  it("accepts only the guide's aliases and old names that warn", () => {
    const unlisted = COMMANDS.flatMap(({ path, command }) =>
      command.aliases
        .filter(
          alias =>
            !isGuideAlias(path, command.name, alias) &&
            !RENAMED_SUBCOMMANDS[path]?.includes(alias) &&
            !DEPRECATED_ALIASES[path]?.includes(alias)
        )
        .map(alias => `${path} (${alias})`)
    );

    expectAllowlist(unlisted, LS_NAME_EXCEPTIONS);
  });

  it.each(
    Object.entries(DEPRECATED_ALIASES)
  )('keeps %s accepting %j', (path, oldNames) => {
    const node = COMMANDS.find(candidate => candidate.path === path);
    expect(node, `${path} is the command's name`).toBeDefined();
    for (const oldName of oldNames) {
      expect(node!.command.aliases, `${path} accepts ${oldName}`).toContain(
        oldName
      );
    }
  });

  it.each(
    Object.entries(RENAMED_OPTIONS)
  )('keeps %s shown, with --%s hidden', (key, oldName) => {
    const [path, name] = key.split(' --');
    const node = COMMANDS.find(candidate => candidate.path === path);
    expect(node, path).toBeDefined();

    expect(optionFor(node!.command, name)?.deprecated, `${key} is shown`).toBe(
      false
    );
    expect(
      optionFor(node!.command, oldName)?.deprecated,
      `${path} --${oldName} still works and is hidden`
    ).toBe(true);
  });

  it('points to one deployment with --deployment <DEPLOYMENT>', () => {
    for (const { command, path } of COMMANDS) {
      const option = optionFor(command, 'deployment');
      if (!option) continue;

      expect(option.type, `${path} --deployment`).toBe(String);
      expect(option.argument, `${path} --deployment`).toBe('DEPLOYMENT');
      expect(option.shorthand, `${path} --deployment`).toBeNull();
      expect(option.deprecated, `${path} --deployment`).toBe(false);
      expect(option.description, `${path} --deployment`).toBeTruthy();
    }
  });

  it('keeps --dpl, --id, and --deployment-id hidden behind --deployment', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(
          option =>
            LEGACY_DEPLOYMENT_OPTIONS.has(option.name) &&
            !(option.deprecated && optionFor(command, 'deployment'))
        )
        .map(option => `${path} --${option.name}`)
    );

    expect(deviations).toEqual([]);
  });

  it('names arguments that point to a deployment deployment', () => {
    const deviations = COMMANDS.filter(({ command }) =>
      command.arguments.some(
        argument =>
          argument.name !== 'deployment' &&
          /deploy|dpl|id-or-url|^url\|/i.test(argument.name)
      )
    ).map(({ path }) => path);

    expectAllowlist(deviations, DEPLOYMENT_ARGUMENT_EXCEPTIONS);
  });

  it('turns a setting on or off with --x and --no-x, never --enabled or --disabled', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(
          option =>
            !option.deprecated &&
            option.description !== undefined &&
            ON_OFF_OPTION_NAME.test(option.name)
        )
        .map(option => `${path} --${option.name}`)
    );

    expect(deviations).toEqual([]);
  });

  it('pairs every --enable with --no-enable', () => {
    const deviations = COMMANDS.filter(
      ({ command }) =>
        optionFor(command, 'enable') && !optionFor(command, 'no-enable')
    ).map(({ path }) => path);

    expect(deviations).toEqual([]);
  });

  it('shows no value hint on a Boolean option', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(
          option => option.type === Boolean && option.argument !== undefined
        )
        .map(option => `${path} --${option.name}`)
    );

    expectAllowlist(deviations, BOOLEAN_HINT_EXCEPTIONS);
  });

  it('never takes on|off or true|false as an option value', () => {
    const deviations = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(option =>
          /on\|off|off\|on|true\|false|false\|true|^boolean$/i.test(
            option.argument ?? ''
          )
        )
        .map(option => `${path} --${option.name}`)
    );

    expect(deviations).toEqual([]);
  });

  it('keeps old on/off values only on a presence flag with a --no- form', () => {
    const legacy = COMMANDS.flatMap(({ command, path }) =>
      command.options
        .filter(option => option.legacyValues)
        .map(option => ({ command, path, option }))
    );
    // Guards the check itself: `project update` and `vcr update` have them.
    expect(legacy.length).toBeGreaterThanOrEqual(3);

    for (const { command, path, option } of legacy) {
      const key = `${path} --${option.name}`;
      expect(option.type, key).toBe(Boolean);
      expect(option.deprecated, key).toBe(false);
      expect(option.argument, key).toBeUndefined();
      const negation = optionFor(command, `no-${option.name}`);
      expect(negation?.type, `${path} --no-${option.name}`).toBe(Boolean);
      expect(negation?.deprecated, `${path} --no-${option.name}`).toBe(false);
    }
  });

  it('never takes enable, disable, on, or off as an argument', () => {
    const deviations = COMMANDS.filter(({ command }) =>
      command.arguments.some(argument =>
        /^(action|state)$|enable|disable|^(on|off)$/i.test(argument.name)
      )
    ).map(({ path }) => path);

    expect(deviations).toEqual([]);
  });

  it('turns targeting on with flags targeting enable, keeping use-targeting hidden', () => {
    const flags = COMMANDS.find(({ path }) => path === 'flags')!.command;
    const useTargeting = flags.subcommands!.find(
      subcommand => subcommand.name === 'use-targeting'
    );
    expect(useTargeting?.hidden).toBe(true);
    expect(
      COMMANDS.find(({ path }) => path === 'flags targeting enable')
    ).toBeDefined();
  });

  it('names commands that show one item inspect, not get or fetch', () => {
    const deviations = COMMANDS.filter(
      ({ command }) => command.name === 'get' || command.name === 'fetch'
    ).map(({ path }) => path);

    expectAllowlist(deviations, GET_NAME_EXCEPTIONS);
  });

  it('writes defaults in help as (default: VALUE)', () => {
    const deviations = [
      ...COMMANDS.flatMap(({ command, path }) => [
        ...[command.description, command.summary]
          .filter(
            (text): text is string =>
              text !== undefined && matchesAny(text, OLD_DEFAULT_FORMS)
          )
          .map(text => `${path}: ${text}`),
        ...command.options
          .filter(
            option =>
              !option.deprecated &&
              option.description !== undefined &&
              matchesAny(option.description, OLD_OPTION_DEFAULT_FORMS)
          )
          .map(option => `${path} --${option.name}: ${option.description}`),
      ]),
      ...(globalCommandOptions as ReadonlyArray<CommandOption>)
        .filter(option =>
          matchesAny(option.description ?? '', OLD_OPTION_DEFAULT_FORMS)
        )
        .map(option => `global --${option.name}: ${option.description}`),
    ];

    expect(deviations).toEqual([]);
  });

  it('writes global option defaults in root help as (default: VALUE)', () => {
    const rootHelp = stripAnsi(help(getRootHelpCommands(commandsStructs)));
    const globalOptions = rootHelp.slice(
      rootHelp.indexOf('Global Options:'),
      rootHelp.indexOf('Examples:')
    );

    expect(
      globalOptions
        .split('\n')
        .filter(line => matchesAny(line, OLD_OPTION_DEFAULT_FORMS))
    ).toEqual([]);
    expect(globalOptions).toContain('Debug mode (default: off)');
  });
});
