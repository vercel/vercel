import { describe, expect, it } from 'vitest';
import type { Command, CommandOption } from '../../../src/commands/help';
import { commands } from '../../../src/commands';
import { activityCommand } from '../../../src/commands/activity/command';
import { agentCommand } from '../../../src/commands/agent/command';
import { agentRunsCommand } from '../../../src/commands/agent-runs/command';
import { aiGatewayCommand } from '../../../src/commands/ai-gateway/command';
import { alertsCommand } from '../../../src/commands/alerts/command';
import { aliasCommand } from '../../../src/commands/alias/command';
import { apiCommand } from '../../../src/commands/api/command';
import { bisectCommand } from '../../../src/commands/bisect/command';
import { blobCommand } from '../../../src/commands/blob/command';
import { buildCommand } from '../../../src/commands/build/command';
import { buyCommand } from '../../../src/commands/buy/command';
import { cacheCommand } from '../../../src/commands/cache/command';
import { certsCommand } from '../../../src/commands/certs/command';
import { commentsCommand } from '../../../src/commands/comments/command';
import { connexCommand } from '../../../src/commands/connex/command';
import { contractCommand } from '../../../src/commands/contract/command';
import { cronsCommand } from '../../../src/commands/crons/command';
import { curlCommand } from '../../../src/commands/curl/command';
import { deployCommand } from '../../../src/commands/deploy/command';
import { deployHooksCommand } from '../../../src/commands/deploy-hooks/command';
import { devCommand } from '../../../src/commands/dev/command';
import { dnsCommand } from '../../../src/commands/dns/command';
import { domainsCommand } from '../../../src/commands/domains/command';
import { envCommand } from '../../../src/commands/env/command';
import { firewallCommand } from '../../../src/commands/firewall/command';
import { flagsCommand } from '../../../src/commands/flags/command';
import { gitCommand } from '../../../src/commands/git/command';
import { globalConfigCommand } from '../../../src/commands/global-config/command';
import { guidanceCommand } from '../../../src/commands/guidance/command';
import { httpstatCommand } from '../../../src/commands/httpstat/command';
import { initCommand } from '../../../src/commands/init/command';
import { inspectCommand } from '../../../src/commands/inspect/command';
import { installCommand } from '../../../src/commands/install/command';
import { integrationCommand } from '../../../src/commands/integration/command';
import { integrationResourceCommand } from '../../../src/commands/integration-resource/command';
import { linkCommand } from '../../../src/commands/link/command';
import { listCommand } from '../../../src/commands/list/command';
import { loginCommand } from '../../../src/commands/login/command';
import { logoutCommand } from '../../../src/commands/logout/command';
import { logsCommand } from '../../../src/commands/logs/command';
import { mcpCommand } from '../../../src/commands/mcp/command';
import { metricsCommand } from '../../../src/commands/metrics/command';
import { microfrontendsCommand } from '../../../src/commands/microfrontends/command';
import { openCommand } from '../../../src/commands/open/command';
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
import { skillsCommand } from '../../../src/commands/skills/command';
import { targetCommand } from '../../../src/commands/target/command';
import { teamsCommand } from '../../../src/commands/teams/command';
import { telemetryCommand } from '../../../src/commands/telemetry/command';
import { tokensCommand } from '../../../src/commands/tokens/command';
import { tracesCommand } from '../../../src/commands/traces/command';
import { upgradeCommand } from '../../../src/commands/upgrade/command';
import { usageCommand } from '../../../src/commands/usage/command';
import { vcrCommand } from '../../../src/commands/vcr/command';
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
  buildCommand,
  buyCommand,
  cacheCommand,
  certsCommand,
  commentsCommand,
  connexCommand,
  contractCommand,
  cronsCommand,
  curlCommand,
  deployCommand,
  deployHooksCommand,
  devCommand,
  dnsCommand,
  domainsCommand,
  envCommand,
  firewallCommand,
  flagsCommand,
  gitCommand,
  globalConfigCommand,
  guidanceCommand,
  httpstatCommand,
  initCommand,
  inspectCommand,
  installCommand,
  integrationCommand,
  integrationResourceCommand,
  linkCommand,
  listCommand,
  loginCommand,
  logoutCommand,
  logsCommand,
  mcpCommand,
  metricsCommand,
  microfrontendsCommand,
  openCommand,
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
  skillsCommand,
  targetCommand,
  teamsCommand,
  telemetryCommand,
  tokensCommand,
  tracesCommand,
  upgradeCommand,
  usageCommand,
  vcrCommand,
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

// This list should eventually be empty.
const OUTPUT_FLAG_EXCEPTIONS = {
  'agent-runs inspect': 'Agent Runs preserves its established --json contract',
  'agent-runs list': 'Agent Runs preserves its established --json contract',
  'agent-runs projects': 'Agent Runs preserves its established --json contract',
  'agent-runs trace': 'Agent Runs preserves its established --json contract',
  'ai-gateway api-keys inspect': 'New AI Gateway family uses --format',
  'ai-gateway api-keys list': 'New AI Gateway family uses --format',
  'ai-gateway api-keys remove': 'New AI Gateway family uses --format',
  'ai-gateway budgets defaults list': 'New AI Gateway family uses --format',
  'ai-gateway budgets defaults remove': 'New AI Gateway family uses --format',
  'ai-gateway budgets defaults set': 'New AI Gateway family uses --format',
  'ai-gateway leaderboard apps':
    'Supports table, JSON, and CSV through --format',
  'ai-gateway leaderboard labs':
    'Supports table, JSON, and CSV through --format',
  'ai-gateway leaderboard models':
    'Supports table, JSON, and CSV through --format',
  'ai-gateway leaderboard providers':
    'Supports table, JSON, and CSV through --format',
  'alerts rules schema': 'Schema output uses the newer --format contract',
  'blob list-stores': 'Blob preserves its established --json contract',
  'blob presign': 'Blob preserves its established --json contract',
  'blob signed-token': 'Blob preserves its established --json contract',
  'buy addon': 'Buy preserves its established --json contract',
  curl: '--json is specific to the trace envelope',
  'firewall diff': 'Firewall preserves its established --json contract',
  'firewall ip-blocks list':
    'Firewall preserves its established --json contract',
  'firewall overview': 'Firewall preserves its established --json contract',
  'firewall rules inspect':
    'Firewall preserves its established --json contract',
  'firewall rules list': 'Firewall preserves its established --json contract',
  'firewall system-bypass list':
    'Firewall preserves its established --json contract',
  'flags evaluations': 'Flags preserves its established --json contract',
  'flags list': 'Flags preserves its established --json contract',
  'flags rules list': 'Flags preserves its established --json contract',
  'flags sdk-keys list': 'Flags preserves its established --json contract',
  'flags segments create': 'Flags preserves its established --json contract',
  'flags segments inspect': 'Flags preserves its established --json contract',
  'flags segments list': 'Flags preserves its established --json contract',
  'flags segments update': 'Flags preserves its established --json contract',
  'flags versions diff': 'Flags preserves its established --json contract',
  'flags versions list': 'Flags preserves its established --json contract',
  logs: '--json emits the established JSONL stream',
  'traces create': '--json emits a trace response envelope',
  'traces get': 'Traces preserves its established --json contract',
  'vcr permissions add': 'New VCR permissions family uses --format',
  'vcr permissions clear': 'New VCR permissions family uses --format',
  'vcr permissions ls': 'New VCR permissions family uses --format',
  'vcr permissions rm': 'New VCR permissions family uses --format',
} as const satisfies Readonly<Record<string, string>>;

const JSON_SHAPE_EXCEPTIONS = {
  'firewall rules add': '--json is a string payload input, not an output mode',
  'firewall rules edit': '--json is a string payload input, not an output mode',
  logs: '--json has the established -j shorthand for its JSONL stream',
} as const satisfies Readonly<Record<string, string>>;

const FORMAT_SHAPE_EXCEPTIONS = {
  skills:
    '--format is a supported but currently undocumented compatibility path',
} as const satisfies Readonly<Record<string, string>>;

const PROJECT_SHAPE_EXCEPTIONS = {
  'agent-runs inspect': 'Uses the NAME|ID placeholder',
  'agent-runs list': 'Uses the NAME|ID placeholder',
  'agent-runs trace': 'Uses the NAME|ID placeholder',
  mcp: '--project is Boolean and means project-scoped setup',
  'microfrontends create-group': 'Accepts repeatable project names',
  'traces get': 'Uses the NAME|ID placeholder',
  'webhooks create': 'Accepts only a project ID and can be repeated',
} as const satisfies Readonly<Record<string, string>>;

/**
 * Metadata cannot tell us whether a prompt is safe to bypass. Keep known
 * prompt-without---yes cases explicit so fixing one makes this allowlist stale.
 * Command-level tests must still cover the actual TTY/non-interactive behavior.
 */
const PROMPT_WITHOUT_YES_EXCEPTIONS = {
  'domains buy': 'Billing and contact choices intentionally require a person',
  'domains transfer-in': 'Paid ownership transfer needs command-specific proof',
  'microfrontends add-to-group':
    'Billing-impacting mutation intentionally rejects non-interactive use',
  'project remove': 'Severe deletion needs typed or command-specific proof',
  'rolling-release configure':
    'Known gap: fully specified configuration still asks for confirmation',
} as const satisfies Readonly<Record<string, string>>;

const OPTION_NAME_EXCEPTIONS = {
  'rolling-release approve --currentStageIndex':
    'Existing camelCase compatibility flag',
} as const satisfies Readonly<Record<string, string>>;

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

  it('pairs --format and Boolean --json unless explicitly allowlisted', () => {
    const deviations = COMMANDS.filter(({ command }) => {
      const hasFormat = optionFor(command, 'format') !== undefined;
      return hasFormat !== hasBooleanJson(command);
    }).map(({ path }) => path);

    expectAllowlist(deviations, OUTPUT_FLAG_EXCEPTIONS);
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

  it('keeps --format a documented FORMAT string with -F', () => {
    const deviations = COMMANDS.filter(({ command }) => {
      const option = optionFor(command, 'format');
      return (
        option !== undefined &&
        (option.type !== String ||
          option.shorthand !== 'F' ||
          option.argument !== 'FORMAT' ||
          option.deprecated ||
          option.description === undefined)
      );
    }).map(({ path }) => path);

    expectAllowlist(deviations, FORMAT_SHAPE_EXCEPTIONS);
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
});
