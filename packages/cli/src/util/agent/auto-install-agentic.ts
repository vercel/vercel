import { readFile, writeFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import type Client from '../client';
import output from '../../output-manager';
import {
  claudeCode,
  claudeDir,
} from '../ai-gateway/coding-agents/agents/claude-code';

const PREFS_FILE = 'agent-preferences.json';
const CLAUDE_LEGACY_PLUGIN_ID = 'vercel-plugin@vercel';
const CLAUDE_OFFICIAL_MARKETPLACE = 'claude-plugins-official';
const CLAUDE_OFFICIAL_MARKETPLACE_SOURCE = 'anthropics/claude-plugins-official';
const CLAUDE_OFFICIAL_PLUGIN_ID = `vercel@${CLAUDE_OFFICIAL_MARKETPLACE}`;
// Claude Code's built-in plugin directory lists the same plugin.
const CLAUDE_DIRECTORY_PLUGIN_ID = 'vercel@anthropic-plugin-directory';
const VERCEL_PLUGIN_VERSION_URL =
  'https://raw.githubusercontent.com/vercel/vercel-plugin/main/.claude-plugin/plugin.json';

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
  pluginAutoUpdate: z.boolean().optional(),
  lastPromptedAt: promptedAtSchema.optional(),
  lastPluginAutoUpdateAttemptedAt: promptedAtSchema.optional(),
  lastPluginAutoUpdateAttemptedKey: z.string().optional(),
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

/** The saved answer to the Vercel plugin offer: `true` for yes, `false` for no. */
export async function getSavedPluginAnswer(
  client: Client
): Promise<boolean | undefined> {
  const { pluginDeclined } = await readPrefs(client);
  return pluginDeclined === undefined ? undefined : !pluginDeclined;
}

export async function savePluginAnswer(
  client: Client,
  accepted: boolean
): Promise<void> {
  const prefs = await readPrefs(client);
  prefs.pluginDeclined = !accepted;
  prefs.pluginAutoUpdate = accepted;
  await markPromptedToday(client, prefs);
}

/**
 * Whether Claude Code's plugin registry lists the Vercel plugin from the
 * official marketplace or the built-in directory. Reads the registry file
 * instead of running `claude`, so the check is instant.
 */
export async function hasClaudeVercelPlugin(home: string): Promise<boolean> {
  // The registry lives in the config dir Claude Code uses, which honors
  // `CLAUDE_CONFIG_DIR`, like the detection that decides to offer the plugin.
  const plugins = await readClaudeInstalledPluginsFromRegistry(
    join(claudeDir(home), 'plugins', 'installed_plugins.json')
  );
  return plugins.some(
    plugin =>
      plugin.id === CLAUDE_OFFICIAL_PLUGIN_ID ||
      plugin.id === CLAUDE_DIRECTORY_PLUGIN_ID
  );
}

async function readClaudeInstalledPluginsFromRegistry(
  registryPath = getClaudeInstalledPluginsRegistryPath()
): Promise<ClaudeListedPlugin[]> {
  try {
    const raw = await readFile(registryPath, 'utf-8');
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
      message: 'Vercel Plugin for Claude Code is not installed.',
      confirm: 'Would you like to install it now?',
    };
  }

  if (plan.installOfficial && status.state === 'legacy-only') {
    return {
      message:
        'Update available for Vercel Plugin for Claude Code (legacy -> official).',
      confirm: 'Would you like to update now?',
    };
  }

  if (status.state === 'both' && plan.removeLegacy) {
    return {
      message:
        'Vercel Plugin for Claude Code has a legacy install to clean up.',
      confirm: 'Would you like to update now?',
    };
  }

  if (plan.updateOfficial) {
    const fromVersion = status.official?.version;
    const toVersion = status.latestVersion;
    const versionRange =
      fromVersion && toVersion ? ` (v${fromVersion} -> v${toVersion})` : '';
    return {
      message: `Update available for Vercel Plugin for Claude Code${versionRange}.`,
      confirm: 'Would you like to update now?',
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

/**
 * A fresh Claude Code config has only the built-in plugin directory, so an
 * install from the official marketplace fails until the marketplace is added.
 */
async function ensureClaudeOfficialMarketplace(): Promise<boolean> {
  const result = await runCommand('claude', [
    'plugins',
    'marketplace',
    'list',
    '--json',
  ]);
  let marketplaces: unknown;
  try {
    marketplaces = JSON.parse(result.stdout);
  } catch {
    // Handled below.
  }
  if (result.exitCode !== 0 || !Array.isArray(marketplaces)) {
    // Without the list, let the install itself report any problem.
    output.debug(
      `Failed to list Claude plugin marketplaces: ${result.stderr || result.stdout}`
    );
    return true;
  }
  if (
    marketplaces.some(
      marketplace =>
        (marketplace as { name?: unknown })?.name ===
        CLAUDE_OFFICIAL_MARKETPLACE
    )
  ) {
    return true;
  }

  const added = await runClaudeCommand(
    'Adding the official Claude plugin marketplace...',
    'Added the official Claude plugin marketplace',
    'Failed to add the official Claude plugin marketplace.',
    ['plugins', 'marketplace', 'add', CLAUDE_OFFICIAL_MARKETPLACE_SOURCE],
    { quietSuccess: true }
  );
  if (!added) {
    output.log(
      `Setup command: claude plugins marketplace add ${CLAUDE_OFFICIAL_MARKETPLACE_SOURCE}`
    );
  }
  return added;
}

async function removeStaleLegacyClaudePlugin(
  removeMarketplace: boolean
): Promise<{ removedPlugin: boolean; complete: boolean }> {
  output.spinner('Removing the stale legacy Vercel Claude plugin...');
  const removedRegistryEntry = await removeClaudePluginFromRegistry(
    CLAUDE_LEGACY_PLUGIN_ID
  );
  output.stopSpinner();

  if (!removedRegistryEntry) {
    output.warn(
      'Could not remove the stale legacy Vercel Claude plugin registry entry.'
    );
    return { removedPlugin: false, complete: false };
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
    return { removedPlugin: true, complete: removedMarketplace };
  }

  return { removedPlugin: true, complete: true };
}

async function runClaudeMigration(
  plan: ClaudePluginMigrationPlan
): Promise<boolean> {
  let removedStaleLegacy = false;
  let complete = true;

  if (plan.removeLegacy) {
    const statusBeforeInstall = await getClaudePluginStatus();
    if (statusBeforeInstall.legacy?.stale) {
      const cleanup = await removeStaleLegacyClaudePlugin(
        plan.removeLegacyMarketplace
      );
      removedStaleLegacy = cleanup.removedPlugin;
      complete = cleanup.complete;
    }
  }

  if (plan.installOfficial) {
    if (!(await ensureClaudeOfficialMarketplace())) {
      return false;
    }
    const installed = await runClaudeCommand(
      'Installing the official Vercel Claude plugin...',
      'Updated the Vercel plugin',
      'Failed to install the official Vercel Claude plugin.',
      ['plugins', 'install', CLAUDE_OFFICIAL_PLUGIN_ID]
    );
    if (!installed) {
      return false;
    }
  } else if (plan.updateOfficial) {
    const updated = await runClaudeCommand(
      'Updating the official Vercel Claude plugin...',
      'Updated the Vercel plugin',
      'Failed to update the official Vercel Claude plugin.',
      ['plugins', 'update', CLAUDE_OFFICIAL_PLUGIN_ID]
    );
    if (!updated) {
      return false;
    }
  }

  const statusAfterInstall = await getClaudePluginStatus();
  if (!statusAfterInstall.official) {
    output.warn(
      'Skipping Claude cleanup because the official Vercel plugin is not installed.'
    );
    return false;
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
      return false;
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
        return false;
      }
    }
  }
  return complete;
}

async function getClaudePluginStatus(): Promise<ClaudePluginStatus> {
  const [installedPlugins, latestVersion] = await Promise.all([
    getClaudeInstalledPlugins(),
    fetchLatestVercelPluginVersion(),
  ]);
  return buildClaudePluginStatus(installedPlugins, latestVersion);
}

export type PluginSetupStatus =
  | 'installed'
  | 'enabled'
  | 'updated'
  | 'up_to_date'
  | 'not_detected'
  | 'unsupported'
  | 'disabled'
  | 'declined'
  | 'confirmation_required'
  | 'dry_run'
  | 'failed';

export interface PluginSetupResult {
  status: PluginSetupStatus;
  message: string;
  /** What a dry run would do, so the caller can word its receipt. */
  action?: 'install' | 'update' | 'enable';
}

function describeClaudePlan(plan: ClaudePluginMigrationPlan): string {
  const actions: string[] = [];
  if (plan.installOfficial) actions.push('install the official plugin');
  if (plan.updateOfficial) actions.push('update the official plugin');
  if (plan.removeLegacy) actions.push('remove the legacy plugin');
  if (plan.removeLegacyMarketplace)
    actions.push('remove the legacy marketplace');
  return actions.join(', ');
}

/**
 * The explicit `vercel setup` path. It targets Claude Code whenever it is
 * installed on the machine, and reports what happened so the caller can render
 * a receipt. Prompts go through `client.input`; the caller decides
 * interactivity.
 */
export async function setupVercelPlugin(
  client: Client,
  opts: { yes: boolean; dryRun: boolean; canPrompt: boolean; home: string }
): Promise<PluginSetupResult> {
  if (!(await claudeCode.detect(opts.home))) {
    return {
      status: 'not_detected',
      message: 'Claude Code was not detected on this machine.',
    };
  }

  const status = await getClaudePluginStatus();
  if (status.official?.stale) {
    return {
      status: 'failed',
      message:
        'The installed Vercel plugin files are missing. Run `claude plugins uninstall vercel@claude-plugins-official`, then run `vercel setup plugin --agent claude-code` to reinstall it.',
    };
  }
  const plan = buildClaudePluginMigrationPlan(status);
  if (!hasClaudeMigrationActions(plan)) {
    const version = status.official?.version
      ? ` (v${status.official.version})`
      : '';
    return {
      status: 'up_to_date',
      message: `Vercel plugin for Claude Code is installed${version}.`,
    };
  }

  const copy = buildClaudePromptCopy(status, plan);
  if (opts.dryRun) {
    return {
      status: 'dry_run',
      message: `${copy.message} Setup would ${describeClaudePlan(plan)}.`,
      action: plan.installOfficial ? 'install' : 'update',
    };
  }

  const prefs = await readPrefs(client);
  if (!opts.yes) {
    if (!opts.canPrompt) {
      return {
        status: 'confirmation_required',
        message: `${copy.message} Re-run with --yes to apply it.`,
      };
    }
    output.print(`  ${copy.message}\n`);
    const accepted = await client.input.confirm(copy.confirm, true);
    await markPromptedToday(client, prefs);
    if (!accepted) {
      prefs.pluginDeclined = true;
      prefs.pluginAutoUpdate = false;
      await writePrefs(client, prefs);
      return {
        status: 'declined',
        message: 'Skipped the Vercel plugin for Claude Code.',
      };
    }
  }

  prefs.pluginDeclined = false;
  prefs.pluginAutoUpdate = true;
  await writePrefs(client, prefs);
  const migrated = await runClaudeMigration(plan);

  const after = await getClaudePluginStatus();
  if (!after.official) {
    return {
      status: 'failed',
      message:
        'Failed to install the Vercel plugin for Claude Code. Run `claude plugins install vercel@claude-plugins-official` to install it manually.',
    };
  }
  // Verify the plan against the version we offered, even if the second
  // manifest request fails. A successful subprocess can also leave stale state.
  // An install gets the version the marketplace serves, which can trail
  // vercel-plugin's main branch, so only an update must reach that version.
  const remaining = buildClaudePluginMigrationPlan({
    ...after,
    latestVersion: plan.updateOfficial ? status.latestVersion : undefined,
  });
  if (
    !migrated ||
    after.official.stale ||
    hasClaudeMigrationActions(remaining)
  ) {
    return {
      status: 'failed',
      message:
        'Failed to complete Vercel plugin setup for Claude Code. Re-run `vercel setup plugin --agent claude-code --yes` to retry.',
    };
  }
  const version = after.official.version ? ` v${after.official.version}` : '';
  return {
    status: plan.installOfficial ? 'installed' : 'updated',
    message: `${plan.installOfficial ? 'Installed' : 'Updated'} the Vercel plugin for Claude Code${version}.`,
  };
}
