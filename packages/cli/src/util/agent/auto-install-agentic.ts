import { readFile, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import type Client from '../client';
import output from '../../output-manager';
import getGlobalPathConfig from '../config/global-path';
import { AGENT_ACTION } from '../agent-output-constants';

const PREFS_FILE = 'agent-preferences.json';
const CLAUDE_LEGACY_PLUGIN_ID = 'vercel-plugin@vercel';
const CLAUDE_OFFICIAL_PLUGIN_ID = 'vercel@claude-plugins-official';
const VERCEL_PLUGIN_VERSION_URL =
  'https://raw.githubusercontent.com/vercel/vercel-plugin/main/.claude-plugin/plugin.json';

const AGENT_TO_TARGET: Record<string, string> = {
  [KNOWN_AGENTS.CLAUDE]: 'claude-code',
  [KNOWN_AGENTS.COWORK]: 'claude-code',
};

export function getPluginTargetForAgent(
  agentName?: string
): string | undefined {
  if (!agentName) {
    return undefined;
  }
  return AGENT_TO_TARGET[agentName];
}

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
  const targetForAgent = getPluginTargetForAgent(agentName);
  if (targetForAgent) {
    return [targetForAgent];
  }
  if (agentName) {
    return [];
  }
  const home = homedir();
  const targets: string[] = [];
  if (await fileExists(join(home, '.claude'))) {
    targets.push('claude-code');
  }
  return targets;
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

async function isPluginInstalledForTarget(target: string): Promise<boolean> {
  if (target === 'claude-code') {
    const status = await getClaudePluginStatus();
    return status.state === 'official-only';
  }
  return false;
}

async function confirm(client: Client, message: string): Promise<boolean> {
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

export function buildClaudePromptCopy(
  status: ClaudePluginStatus,
  plan: ClaudePluginMigrationPlan
): { message: string; confirm: string } {
  if (plan.installOfficial && status.state === 'none') {
    return {
      message: '',
      confirm:
        'Working with Vercel is easier with the Vercel Plugin for Claude Code. Would you like to install it?',
    };
  }

  if (plan.installOfficial && status.state === 'legacy-only') {
    return {
      message: '',
      confirm:
        'Working with Vercel is easier with the latest Vercel Plugin for Claude Code. Would you like to update it?',
    };
  }

  if (status.state === 'both' && plan.removeLegacy) {
    return {
      message: '',
      confirm:
        'Working with Vercel is easier with the latest Vercel Plugin for Claude Code. Would you like to update it?',
    };
  }

  if (plan.updateOfficial) {
    const fromVersion = status.official?.version ?? 'your current version';
    const toVersion = status.latestVersion ?? 'the latest version';
    return {
      message: '',
      confirm: `Working with Vercel is easier with the latest Vercel Plugin for Claude Code. Would you like to update from ${fromVersion} to ${toVersion}?`,
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
  if (status.state === 'legacy-only') {
    return `Working with Vercel is easier with the latest Vercel Plugin for Claude Code. It will run:\n1. claude plugins install ${CLAUDE_OFFICIAL_PLUGIN_ID}\n2. claude plugins uninstall ${CLAUDE_LEGACY_PLUGIN_ID}\nWould you like me to update it?`;
  }

  if (status.state === 'both' || plan.removeLegacy) {
    return `Working with Vercel is easier with the latest Vercel Plugin for Claude Code. It will run:\n1. claude plugins uninstall ${CLAUDE_LEGACY_PLUGIN_ID}\nWould you like me to update it?`;
  }

  if (plan.updateOfficial) {
    return `Working with Vercel is easier with the latest Vercel Plugin for Claude Code. It will run:\n1. claude plugins update ${CLAUDE_OFFICIAL_PLUGIN_ID}\nWould you like me to update it?`;
  }

  return `Working with Vercel is easier with the Vercel Plugin for Claude Code. It will run:\n1. claude plugins install ${CLAUDE_OFFICIAL_PLUGIN_ID}\nWould you like me to install it?`;
}

function buildClaudeActionRequiredLabel(
  status: ClaudePluginStatus,
  plan: ClaudePluginMigrationPlan
): string {
  if (
    status.state === 'legacy-only' ||
    status.state === 'both' ||
    plan.removeLegacy ||
    plan.updateOfficial
  ) {
    return 'Update it';
  }

  return 'Install it';
}

function getClaudeActionRequiredCommand(
  status: ClaudePluginStatus,
  plan: ClaudePluginMigrationPlan
): string {
  if (plan.installOfficial && status.state === 'none') {
    return `claude plugins install ${CLAUDE_OFFICIAL_PLUGIN_ID}`;
  }

  if (status.state === 'both' && plan.removeLegacy) {
    return `claude plugins uninstall ${CLAUDE_LEGACY_PLUGIN_ID}`;
  }

  if (plan.updateOfficial && status.state === 'official-only') {
    return `claude plugins update ${CLAUDE_OFFICIAL_PLUGIN_ID}`;
  }

  return `claude plugins install ${CLAUDE_OFFICIAL_PLUGIN_ID}`;
}

function getClaudeActionRequiredNextSteps(
  status: ClaudePluginStatus,
  plan: ClaudePluginMigrationPlan
): Array<{ command: string; when?: string }> {
  const next: Array<{ command: string; when?: string }> = [
    {
      command: getClaudeActionRequiredCommand(status, plan),
      when: buildClaudeActionRequiredLabel(status, plan),
    },
  ];

  if (status.state === 'legacy-only' && plan.removeLegacy) {
    next.push({
      command: `claude plugins uninstall ${CLAUDE_LEGACY_PLUGIN_ID}`,
      when: 'Remove the old plugin after the update',
    });
  }

  return next;
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
    } else {
      output.debug(`Skipping unsupported plugin target: ${target}`);
    }
  }
}

export async function autoInstallVercelPlugin(
  client: Client,
  options?: { autoConfirm?: boolean; mode?: 'prompt' | 'apply' }
): Promise<void> {
  try {
    const prefs = await readPrefs();
    const applyMode = options?.mode === 'apply';

    if (!prefs.pluginDeclined || applyMode) {
      const targets = await getPluginTargets(client.agentName);
      const uninstalledTargets: string[] = [];
      const claudeStatus = targets.includes('claude-code')
        ? await getClaudePluginStatus()
        : undefined;
      const claudePlan = claudeStatus
        ? buildClaudePluginMigrationPlan(claudeStatus)
        : undefined;

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

      if (uninstalledTargets.length > 0) {
        if (!applyMode && wasPromptedToday(prefs)) {
          return;
        }

        if (applyMode) {
          prefs.pluginDeclined = false;
          await writePrefs(prefs);
          await applyPluginActions(uninstalledTargets, claudePlan);
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

        // Agents in non-TTY: output structured JSON so agent prompts the user
        if (client.isAgent && !client.stdin.isTTY) {
          const actionRequiredMessage =
            uninstalledTargets.includes('claude-code') &&
            claudeStatus &&
            claudePlan
              ? buildClaudeActionRequiredMessage(claudeStatus, claudePlan)
              : promptMessages.join(' ');
          const next =
            uninstalledTargets.includes('claude-code') &&
            claudeStatus &&
            claudePlan
              ? getClaudeActionRequiredNextSteps(claudeStatus, claudePlan)
              : [
                  {
                    command: `claude plugins install ${CLAUDE_OFFICIAL_PLUGIN_ID}`,
                    when: 'Install it',
                  },
                ];
          client.stdout.write(
            `${JSON.stringify(
              {
                status: 'action_required',
                reason: 'plugin_install',
                action: AGENT_ACTION.CONFIRMATION_REQUIRED,
                message: actionRequiredMessage,
                userActionRequired: true,
                next,
              },
              null,
              2
            )}\n`
          );
          await markPromptedToday(prefs);
          return;
        }

        const promptMessage = promptMessages.join(' ').trim();
        if (promptMessage) {
          output.log(promptMessage);
        }
        const accepted = await confirm(client, confirmMessage);
        await markPromptedToday(prefs);
        if (accepted) {
          prefs.pluginDeclined = false;
          await writePrefs(prefs);
          await applyPluginActions(uninstalledTargets, claudePlan);
        } else {
          prefs.pluginDeclined = true;
          await writePrefs(prefs);
        }
      }
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
