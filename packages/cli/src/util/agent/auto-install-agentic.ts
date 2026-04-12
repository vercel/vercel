import { readFile, writeFile, readdir } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import type Client from '../client';
import { buildCommandWithYes } from '../agent-output';
import output from '../../output-manager';
import getGlobalPathConfig from '../config/global-path';

const PREFS_FILE = 'agent-preferences.json';
const CLAUDE_LEGACY_PLUGIN_ID = 'vercel-plugin@vercel';
const CLAUDE_OFFICIAL_PLUGIN_ID = 'vercel@claude-plugins-official';
const VERCEL_PLUGIN_VERSION_URL =
  'https://raw.githubusercontent.com/vercel/vercel-plugin/main/.claude-plugin/plugin.json';

const AGENT_TO_TARGET: Record<string, string> = {
  [KNOWN_AGENTS.CLAUDE]: 'claude-code',
  [KNOWN_AGENTS.COWORK]: 'claude-code',
  [KNOWN_AGENTS.CURSOR]: 'cursor',
  [KNOWN_AGENTS.CURSOR_CLI]: 'cursor',
};

interface AgentPreferences {
  pluginDeclined?: boolean;
  lastPromptedAt?: string;
  pluginDismissed?: boolean;
}

interface ClaudeListedPlugin {
  id: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
  installPath?: string;
  installedAt?: string;
  lastUpdated?: string;
  mcpServers?: Record<string, unknown>;
}

export type ClaudePluginInstallState =
  | 'none'
  | 'legacy-only'
  | 'official-only'
  | 'both';

export interface ClaudePluginStatus {
  state: ClaudePluginInstallState;
  legacy?: ClaudeListedPlugin;
  official?: ClaudeListedPlugin;
  latestVersion?: string;
}

export interface ClaudePluginMigrationPlan {
  installOfficial: boolean;
  updateOfficial: boolean;
  removeLegacy: boolean;
  removeLegacyMarketplace: boolean;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPrefs(): Promise<AgentPreferences> {
  try {
    const raw = await readFile(
      join(getGlobalPathConfig(), PREFS_FILE),
      'utf-8'
    );
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writePrefs(prefs: AgentPreferences): Promise<void> {
  try {
    const normalizedPrefs: AgentPreferences = {};

    if (prefs.pluginDeclined) {
      normalizedPrefs.pluginDeclined = true;
    }
    if (prefs.lastPromptedAt) {
      normalizedPrefs.lastPromptedAt = prefs.lastPromptedAt;
    }

    await writeFile(
      join(getGlobalPathConfig(), PREFS_FILE),
      JSON.stringify(normalizedPrefs, null, 2),
      'utf-8'
    );
  } catch {
    // ignore
  }
}

async function getPluginTargets(agentName?: string): Promise<string[]> {
  if (agentName && AGENT_TO_TARGET[agentName]) {
    return [AGENT_TO_TARGET[agentName]];
  }
  const home = homedir();
  const targets: string[] = [];
  if (await fileExists(join(home, '.claude'))) {
    targets.push('claude-code');
  }
  if (await fileExists(join(home, '.cursor'))) {
    targets.push('cursor');
  }
  return targets;
}

async function isPluginInClaudeRegistry(): Promise<boolean> {
  const plugins = await getClaudeInstalledPlugins();
  return plugins.some(
    plugin =>
      plugin.id === CLAUDE_LEGACY_PLUGIN_ID ||
      plugin.id === CLAUDE_OFFICIAL_PLUGIN_ID
  );
}

async function readClaudeInstalledPluginsFromRegistry(): Promise<
  ClaudeListedPlugin[]
> {
  try {
    const raw = await readFile(
      join(homedir(), '.claude', 'plugins', 'installed_plugins.json'),
      'utf-8'
    );
    const data = JSON.parse(raw);
    const plugins: Record<string, unknown> = data?.plugins ?? {};
    const entries: ClaudeListedPlugin[] = [];

    for (const [id, installs] of Object.entries(plugins)) {
      if (!Array.isArray(installs)) continue;
      for (const install of installs) {
        if (!install || typeof install !== 'object') continue;
        entries.push({
          id,
          ...(install as Omit<ClaudeListedPlugin, 'id'>),
          enabled: true,
        });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

async function isPluginInCursorPlugins(): Promise<boolean> {
  const pluginsDir = join(homedir(), '.cursor', 'plugins');
  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.includes('vercel-plugin')) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function isPluginInstalledForTarget(target: string): Promise<boolean> {
  if (target === 'claude-code') {
    const status = await getClaudePluginStatus();
    return status.state === 'official-only';
  }
  if (target === 'cursor') {
    return (
      (await isPluginInClaudeRegistry()) || (await isPluginInCursorPlugins())
    );
  }
  return false;
}

async function confirm(
  client: Client,
  message: string,
  autoConfirm?: boolean
): Promise<boolean> {
  if (autoConfirm && !client.isAgent) {
    return true;
  }
  if (!client.stdin.isTTY) {
    return false;
  }
  return client.input.confirm(message, true);
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function wasPromptedToday(prefs: AgentPreferences): boolean {
  return prefs.lastPromptedAt === getTodayKey();
}

async function markPromptedToday(prefs: AgentPreferences): Promise<void> {
  prefs.lastPromptedAt = getTodayKey();
  await writePrefs(prefs);
}

async function runCommand(
  command: string,
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return await new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('close', code => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
    child.on('error', err => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${String(err)}` });
    });
  });
}

async function getClaudeInstalledPlugins(): Promise<ClaudeListedPlugin[]> {
  const result = await runCommand('claude', ['plugins', 'list', '--json']);
  if (result.exitCode === 0) {
    try {
      const parsed = JSON.parse(result.stdout);
      if (Array.isArray(parsed)) {
        return parsed as ClaudeListedPlugin[];
      }
    } catch (err) {
      output.debug(`Failed to parse Claude plugin list JSON: ${err}`);
    }
  } else if (result.stderr.trim().length > 0) {
    output.debug(
      `Failed to run 'claude plugins list --json': ${result.stderr}`
    );
  }

  return readClaudeInstalledPluginsFromRegistry();
}

async function fetchLatestVercelPluginVersion(): Promise<string | undefined> {
  try {
    const response = await fetch(VERCEL_PLUGIN_VERSION_URL);
    if (!response.ok) {
      output.debug(
        `Failed to fetch latest Vercel plugin version: ${response.status}`
      );
      return undefined;
    }

    const manifest = (await response.json()) as { version?: unknown };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch (err) {
    output.debug(`Failed to fetch latest Vercel plugin version: ${err}`);
    return undefined;
  }
}

export function comparePluginVersions(a?: string, b?: string): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const parse = (value: string) =>
    value.split('.').map(part => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const maxLength = Math.max(left.length, right.length);

  for (let i = 0; i < maxLength; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
}

export function buildClaudePluginStatus(
  installedPlugins: ClaudeListedPlugin[],
  latestVersion?: string
): ClaudePluginStatus {
  const legacy = installedPlugins.find(
    plugin => plugin.id === CLAUDE_LEGACY_PLUGIN_ID
  );
  const official = installedPlugins.find(
    plugin => plugin.id === CLAUDE_OFFICIAL_PLUGIN_ID
  );

  let state: ClaudePluginInstallState = 'none';
  if (legacy && official) state = 'both';
  else if (legacy) state = 'legacy-only';
  else if (official) state = 'official-only';

  return {
    state,
    legacy,
    official,
    latestVersion,
  };
}

export function buildClaudePluginMigrationPlan(
  status: ClaudePluginStatus
): ClaudePluginMigrationPlan {
  const plan: ClaudePluginMigrationPlan = {
    installOfficial: false,
    updateOfficial: false,
    removeLegacy: false,
    removeLegacyMarketplace: false,
  };

  switch (status.state) {
    case 'none':
      plan.installOfficial = true;
      break;
    case 'legacy-only':
      plan.installOfficial = true;
      plan.removeLegacy = true;
      plan.removeLegacyMarketplace = true;
      break;
    case 'both':
      plan.removeLegacy = true;
      plan.removeLegacyMarketplace = true;
      break;
    case 'official-only':
      break;
  }

  if (
    status.official?.version &&
    status.latestVersion &&
    comparePluginVersions(status.official.version, status.latestVersion) < 0
  ) {
    plan.updateOfficial = true;
  }

  return plan;
}

function hasClaudeMigrationActions(plan: ClaudePluginMigrationPlan): boolean {
  return (
    plan.installOfficial ||
    plan.updateOfficial ||
    plan.removeLegacy ||
    plan.removeLegacyMarketplace
  );
}

function formatClaudeStatus(status: ClaudePluginStatus): string {
  return `state=${status.state}, legacy=${status.legacy?.version ?? 'none'}, official=${status.official?.version ?? 'none'}, latest=${status.latestVersion ?? 'unknown'}`;
}

function formatClaudePlan(plan: ClaudePluginMigrationPlan): string {
  return `installOfficial=${plan.installOfficial}, updateOfficial=${plan.updateOfficial}, removeLegacy=${plan.removeLegacy}, removeLegacyMarketplace=${plan.removeLegacyMarketplace}`;
}

function getClaudeMigrationCommands(
  plan: ClaudePluginMigrationPlan
): Array<{ command: string; when: string }> {
  const commands: Array<{ command: string; when: string }> = [];

  if (plan.installOfficial) {
    commands.push({
      command: `claude plugins install ${CLAUDE_OFFICIAL_PLUGIN_ID}`,
      when: 'Upgrade from the official Claude Plugin Marketplace',
    });
  } else if (plan.updateOfficial) {
    commands.push({
      command: `claude plugins update ${CLAUDE_OFFICIAL_PLUGIN_ID}`,
      when: 'Upgrade from the official Claude Plugin Marketplace',
    });
  }

  if (plan.removeLegacy) {
    commands.push({
      command: `claude plugins uninstall ${CLAUDE_LEGACY_PLUGIN_ID}`,
      when: 'Remove the old Vercel plugin install after the upgrade',
    });
  }

  if (plan.removeLegacyMarketplace) {
    commands.push({
      command: 'claude plugins marketplace remove vercel',
      when: 'Remove the old Vercel marketplace after the upgrade',
    });
  }

  return commands;
}

export function buildClaudePromptCopy(
  status: ClaudePluginStatus,
  plan: ClaudePluginMigrationPlan
): { message: string; confirm: string } {
  if (plan.installOfficial && status.state === 'none') {
    return {
      message:
        'Claude Code does not have the Vercel plugin installed. Install it from the official Claude marketplace.',
      confirm:
        'Install the Vercel plugin from the official Claude marketplace?',
    };
  }

  if (plan.installOfficial && status.state === 'legacy-only') {
    return {
      message:
        "You're using an older version of the Vercel Plugin. Update from the official Claude Plugin Marketplace?",
      confirm: 'Update the Vercel Plugin?',
    };
  }

  if (status.state === 'both' && plan.removeLegacy) {
    return {
      message:
        "You're using an older version of the Vercel Plugin. Update from the official Claude Plugin Marketplace?",
      confirm: 'Update the Vercel Plugin?',
    };
  }

  if (plan.updateOfficial) {
    const fromVersion = status.official?.version ?? 'your current version';
    const toVersion = status.latestVersion ?? 'the latest version';
    return {
      message: `A newer Vercel plugin version is available in the official Claude marketplace. Update from ${fromVersion} to ${toVersion}.`,
      confirm: `Update the Vercel plugin from ${fromVersion} to ${toVersion}?`,
    };
  }

  return {
    message:
      'The Vercel plugin needs attention in Claude Code before your agent harness is fully up to date.',
    confirm: 'Apply the Vercel plugin changes for Claude Code?',
  };
}

export function buildClaudeActionRequiredMessage(
  status: ClaudePluginStatus,
  plan: ClaudePluginMigrationPlan
): string {
  if (
    status.state === 'legacy-only' ||
    status.state === 'both' ||
    plan.removeLegacy
  ) {
    return "The CLI detected that you're using an older version of the Vercel Plugin. Do you want to upgrade from the official Claude Plugin Marketplace?";
  }

  if (plan.updateOfficial) {
    const fromVersion = status.official?.version ?? 'your current version';
    const toVersion = status.latestVersion ?? 'the latest version';
    return `The CLI detected that a newer Vercel Plugin version is available. Do you want to update from ${fromVersion} to ${toVersion} from the official Claude Plugin Marketplace?`;
  }

  return 'The CLI detected that Claude Code does not have the Vercel Plugin installed. Do you want to install it from the official Claude Plugin Marketplace?';
}

function buildAgentRetryCommand(argv: string[]): string | undefined {
  if (argv[2] === 'link') {
    return buildCommandWithYes(argv);
  }

  return undefined;
}

async function runClaudeCommand(
  spinnerMessage: string,
  successMessage: string,
  failureMessage: string,
  args: string[],
  options?: { quietSuccess?: boolean }
): Promise<boolean> {
  output.spinner(spinnerMessage);
  const result = await runCommand('claude', args);
  output.stopSpinner();

  if (result.exitCode === 0) {
    if (!options?.quietSuccess) {
      output.success(successMessage);
    }
    return true;
  }

  output.warn(failureMessage);
  output.debug(
    `Claude command failed: claude ${args.join(' ')}\n${result.stderr || result.stdout}`
  );
  return false;
}

async function runClaudeMigration(
  plan: ClaudePluginMigrationPlan
): Promise<void> {
  output.log(`[plugin-debug] Claude migration plan: ${formatClaudePlan(plan)}`);

  if (plan.installOfficial) {
    const installed = await runClaudeCommand(
      'Installing the official Vercel Claude plugin...',
      'Updated the Vercel plugin',
      'Failed to install the official Vercel Claude plugin.',
      ['plugins', 'install', CLAUDE_OFFICIAL_PLUGIN_ID]
    );
    if (!installed) {
      return;
    }
  } else if (plan.updateOfficial) {
    await runClaudeCommand(
      'Updating the official Vercel Claude plugin...',
      'Updated the Vercel plugin',
      'Failed to update the official Vercel Claude plugin.',
      ['plugins', 'update', CLAUDE_OFFICIAL_PLUGIN_ID]
    );
  }

  const statusAfterInstall = await getClaudePluginStatus();
  if (!statusAfterInstall.official) {
    output.warn(
      'Skipping Claude cleanup because the official Vercel plugin is not installed.'
    );
    return;
  }

  if (plan.removeLegacy && statusAfterInstall.legacy) {
    const removedLegacy = await runClaudeCommand(
      'Removing the legacy Vercel Claude plugin...',
      'Removed the legacy Vercel Claude plugin',
      'Installed the official Vercel Claude plugin, but could not remove the legacy install.',
      ['plugins', 'uninstall', CLAUDE_LEGACY_PLUGIN_ID],
      { quietSuccess: true }
    );
    if (!removedLegacy) {
      output.log(
        `Cleanup command: claude plugins uninstall ${CLAUDE_LEGACY_PLUGIN_ID}`
      );
      return;
    }
  }

  if (plan.removeLegacyMarketplace) {
    const finalStatus = await getClaudePluginStatus();
    if (!finalStatus.legacy) {
      const removedMarketplace = await runClaudeCommand(
        'Removing the legacy Vercel marketplace...',
        'Removed the legacy Vercel marketplace',
        'Removed the legacy Vercel plugin, but could not remove the legacy marketplace.',
        ['plugins', 'marketplace', 'remove', 'vercel'],
        { quietSuccess: true }
      );
      if (!removedMarketplace) {
        output.log('Cleanup command: claude plugins marketplace remove vercel');
      }
    }
  }
}

async function getClaudePluginStatus(): Promise<ClaudePluginStatus> {
  const [installedPlugins, latestVersion] = await Promise.all([
    getClaudeInstalledPlugins(),
    fetchLatestVercelPluginVersion(),
  ]);
  return buildClaudePluginStatus(installedPlugins, latestVersion);
}

async function applyPluginActions(
  targets: string[],
  claudePlan?: ClaudePluginMigrationPlan
): Promise<void> {
  for (const target of targets) {
    if (target === 'claude-code' && claudePlan) {
      await runClaudeMigration(claudePlan);
      continue;
    }

    output.spinner(`Installing Vercel plugin for ${target}...`);
    const result = await runCommand('npx', [
      'plugins',
      'add',
      'vercel/vercel-plugin',
      '--target',
      target,
      '-y',
    ]);
    output.stopSpinner();
    if (result.exitCode === 0) {
      output.success(`Installed Vercel plugin for ${target}`);
    } else {
      output.debug(
        `Failed to install Vercel plugin for ${target}: ${result.stderr || result.stdout}`
      );
    }
  }
}

export async function autoInstallAgentTooling(
  client: Client,
  options?: { autoConfirm?: boolean }
): Promise<void> {
  try {
    const prefs = await readPrefs();
    output.log(
      `[plugin-debug] autoInstallAgentTooling start: agentName=${client.agentName ?? 'unknown'}, isAgent=${String(client.isAgent)}, stdinTTY=${String(client.stdin.isTTY)}, pluginDeclined=${String(prefs.pluginDeclined)}, lastPromptedAt=${prefs.lastPromptedAt ?? 'none'}, legacyPluginDismissed=${String(prefs.pluginDismissed)}`
    );

    if (!prefs.pluginDeclined) {
      const targets = await getPluginTargets(client.agentName);
      output.log(
        `[plugin-debug] detected targets: ${targets.length > 0 ? targets.join(', ') : 'none'}`
      );
      const uninstalledTargets: string[] = [];
      const claudeStatus = targets.includes('claude-code')
        ? await getClaudePluginStatus()
        : undefined;
      const claudePlan = claudeStatus
        ? buildClaudePluginMigrationPlan(claudeStatus)
        : undefined;

      if (claudeStatus) {
        output.log(
          `[plugin-debug] Claude status: ${formatClaudeStatus(claudeStatus)}`
        );
      }
      if (claudePlan) {
        output.log(
          `[plugin-debug] Claude plan: ${formatClaudePlan(claudePlan)}`
        );
      }

      for (const target of targets) {
        if (target === 'claude-code') {
          if (claudePlan && hasClaudeMigrationActions(claudePlan)) {
            uninstalledTargets.push(target);
          }
          continue;
        }

        if (!(await isPluginInstalledForTarget(target))) {
          uninstalledTargets.push(target);
        }
      }

      output.log(
        `[plugin-debug] targets needing action: ${uninstalledTargets.length > 0 ? uninstalledTargets.join(', ') : 'none'}`
      );

      if (uninstalledTargets.length > 0) {
        if (wasPromptedToday(prefs)) {
          output.log('[plugin-debug] prompt already shown today');
          return;
        }

        const promptMessages: string[] = [];
        let confirmMessage = 'Install the Vercel plugin?';

        if (
          uninstalledTargets.includes('claude-code') &&
          claudeStatus &&
          claudePlan
        ) {
          const claudePrompt = buildClaudePromptCopy(claudeStatus, claudePlan);
          promptMessages.push(claudePrompt.message);
          confirmMessage = claudePrompt.confirm;
        }

        if (uninstalledTargets.includes('cursor')) {
          promptMessages.push(
            'Cursor does not have the Vercel plugin installed yet.'
          );
          if (!uninstalledTargets.includes('claude-code')) {
            confirmMessage = 'Install the Vercel plugin for Cursor?';
          } else {
            confirmMessage = 'Apply these Vercel plugin changes?';
          }
        }

        // Agents in non-TTY: output structured JSON so agent prompts the user
        if (client.isAgent && !client.stdin.isTTY) {
          if (options?.autoConfirm) {
            output.log(
              '[plugin-debug] auto-confirming plugin changes in agent mode'
            );
            await markPromptedToday(prefs);
            prefs.pluginDeclined = false;
            await writePrefs(prefs);
            await applyPluginActions(uninstalledTargets, claudePlan);
            return;
          }

          const actionRequiredMessage =
            uninstalledTargets.includes('claude-code') &&
            claudeStatus &&
            claudePlan
              ? buildClaudeActionRequiredMessage(claudeStatus, claudePlan)
              : promptMessages.join(' ');
          const retryCommand = buildAgentRetryCommand(client.argv);
          const next = retryCommand
            ? [
                {
                  command: retryCommand,
                  when: 'Accept and apply the Vercel plugin changes',
                },
              ]
            : uninstalledTargets.flatMap(target => {
                if (target === 'claude-code' && claudePlan) {
                  return getClaudeMigrationCommands(claudePlan).slice(0, 1);
                }

                return [
                  {
                    command: `npx plugins add vercel/vercel-plugin --target ${target} -y`,
                    when: `Install Vercel plugin for ${target}`,
                  },
                ];
              });
          client.stdout.write(
            `${JSON.stringify(
              {
                status: 'action_required',
                reason: 'plugin_install',
                message: actionRequiredMessage,
                hint: actionRequiredMessage,
                next,
              },
              null,
              2
            )}\n`
          );
          await markPromptedToday(prefs);
          return;
        }

        output.log(promptMessages.join(' '));
        const accepted = await confirm(
          client,
          confirmMessage,
          options?.autoConfirm
        );
        output.log(
          `[plugin-debug] install prompt accepted=${String(accepted)}`
        );
        await markPromptedToday(prefs);
        if (accepted) {
          prefs.pluginDeclined = false;
          await writePrefs(prefs);
          await applyPluginActions(uninstalledTargets, claudePlan);
        } else {
          prefs.pluginDeclined = true;
          await writePrefs(prefs);
        }
      } else {
        output.log('[plugin-debug] no plugin action required');
      }
    } else {
      output.log('[plugin-debug] plugin prompt previously declined');
    }
  } catch (err) {
    output.debug(`Auto-install agent tooling failed: ${err}`);
  }
}

export async function showPluginTipIfNeeded(): Promise<void> {
  try {
    const prefs = await readPrefs();
    if (prefs.pluginDeclined) return;

    const targets = await getPluginTargets();
    for (const target of targets) {
      if (!(await isPluginInstalledForTarget(target))) {
        output.log(
          chalk.dim(
            'Tip: Run `npx plugins add vercel/vercel-plugin` to enhance your agent experience'
          )
        );
        return;
      }
    }
  } catch {
    // ignore
  }
}
