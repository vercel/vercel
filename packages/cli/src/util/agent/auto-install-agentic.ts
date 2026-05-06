import { readFile, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import { z } from 'zod';
import type Client from '../client';
import output from '../../output-manager';

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

  if (
    agentName === KNOWN_AGENTS.CLAUDE ||
    agentName.startsWith('claude-code') ||
    agentName === KNOWN_AGENTS.COWORK
  ) {
    return 'claude-code';
  }

  return AGENT_TO_TARGET[agentName];
}

const promptedAtSchema = z.codec(
  z.union([z.iso.date(), z.iso.datetime()]),
  z.date(),
  {
    decode: value => new Date(value),
    encode: value => value.toISOString(),
  }
);

const agentPreferencesSchema = z.object({
  pluginDeclined: z.boolean().optional(),
  lastPromptedAt: promptedAtSchema.optional(),
});

type AgentPreferences = z.output<typeof agentPreferencesSchema>;

interface ClaudeListedPlugin {
  id: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
  installPath?: string;
  stale?: boolean;
  installedAt?: string;
  lastUpdated?: string;
  mcpServers?: Record<string, unknown>;
}

interface ClaudeInstalledPluginsRegistry {
  plugins?: Record<string, unknown>;
  [key: string]: unknown;
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

async function readPrefs(client: Client): Promise<AgentPreferences> {
  return (
    (await client.maybeReadConfig(PREFS_FILE, agentPreferencesSchema)) ?? {}
  );
}

async function writePrefs(
  client: Client,
  prefs: AgentPreferences
): Promise<void> {
  try {
    await client.writeConfig(PREFS_FILE, agentPreferencesSchema, prefs);
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
      getClaudeInstalledPluginsRegistryPath(),
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

function getClaudeInstalledPluginsRegistryPath(): string {
  return join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
}

async function markStaleClaudePluginInstalls(
  plugins: ClaudeListedPlugin[]
): Promise<ClaudeListedPlugin[]> {
  return Promise.all(
    plugins.map(async plugin => {
      if (plugin.installPath && !(await fileExists(plugin.installPath))) {
        return { ...plugin, stale: true };
      }
      return plugin;
    })
  );
}

async function removeClaudePluginFromRegistry(
  pluginId: string
): Promise<boolean> {
  try {
    const registryPath = getClaudeInstalledPluginsRegistryPath();
    const raw = await readFile(registryPath, 'utf-8');
    const data = JSON.parse(raw) as ClaudeInstalledPluginsRegistry;

    if (!data.plugins || !(pluginId in data.plugins)) {
      return false;
    }

    delete data.plugins[pluginId];
    await writeFile(
      registryPath,
      `${JSON.stringify(data, null, 2)}\n`,
      'utf-8'
    );
    return true;
  } catch (err) {
    output.debug(`Failed to remove Claude plugin registry entry: ${err}`);
    return false;
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

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function wasPromptedToday(prefs: AgentPreferences): boolean {
  return prefs.lastPromptedAt
    ? isSameDay(prefs.lastPromptedAt, new Date())
    : false;
}

async function markPromptedToday(
  client: Client,
  prefs: AgentPreferences
): Promise<void> {
  prefs.lastPromptedAt = new Date();
  await writePrefs(client, prefs);
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
        return markStaleClaudePluginInstalls(parsed as ClaudeListedPlugin[]);
      }
    } catch (err) {
      output.debug(`Failed to parse Claude plugin list JSON: ${err}`);
    }
  } else if (result.stderr.trim().length > 0) {
    output.debug(
      `Failed to run 'claude plugins list --json': ${result.stderr}`
    );
  }

  return markStaleClaudePluginInstalls(
    await readClaudeInstalledPluginsFromRegistry()
  );
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

async function removeStaleLegacyClaudePlugin(
  removeMarketplace: boolean
): Promise<boolean> {
  output.spinner('Removing the stale legacy Vercel Claude plugin...');
  const removedRegistryEntry = await removeClaudePluginFromRegistry(
    CLAUDE_LEGACY_PLUGIN_ID
  );
  output.stopSpinner();

  if (!removedRegistryEntry) {
    output.warn(
      'Could not remove the stale legacy Vercel Claude plugin registry entry.'
    );
    return false;
  }

  output.success('Removed the stale legacy Vercel Claude plugin');

  if (removeMarketplace) {
    const removedMarketplace = await runClaudeCommand(
      'Removing the legacy Vercel marketplace...',
      'Removed the legacy Vercel marketplace',
      'Removed the stale legacy Vercel plugin, but could not remove the legacy marketplace.',
      ['plugins', 'marketplace', 'remove', 'vercel'],
      { quietSuccess: true }
    );
    if (!removedMarketplace) {
      output.log('Cleanup command: claude plugins marketplace remove vercel');
    }
  }

  return true;
}

async function runClaudeMigration(
  plan: ClaudePluginMigrationPlan
): Promise<void> {
  let removedStaleLegacy = false;

  if (plan.removeLegacy) {
    const statusBeforeInstall = await getClaudePluginStatus();
    if (statusBeforeInstall.legacy?.stale) {
      removedStaleLegacy = await removeStaleLegacyClaudePlugin(
        plan.removeLegacyMarketplace
      );
    }
  }

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

  if (plan.removeLegacyMarketplace && !removedStaleLegacy) {
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
    const prefs = await readPrefs(client);
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
          await writePrefs(client, prefs);
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

        const promptMessage = promptMessages.join(' ').trim();
        if (promptMessage) {
          output.log(promptMessage);
        }
        const accepted = await confirm(client, confirmMessage);
        await markPromptedToday(client, prefs);
        if (accepted) {
          prefs.pluginDeclined = false;
          await writePrefs(client, prefs);
          await applyPluginActions(uninstalledTargets, claudePlan);
        } else {
          prefs.pluginDeclined = true;
          await writePrefs(client, prefs);
        }
      }
    }
  } catch (err) {
    output.debug(`Auto-install agent tooling failed: ${err}`);
  }
}

export async function showPluginTipIfNeeded(client: Client): Promise<void> {
  try {
    const prefs = await readPrefs(client);
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
