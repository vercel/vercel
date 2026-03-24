import { readFile, writeFile, readdir } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import type Client from '../client';
import agentInit from '../../commands/agent/init';
import {
  BEST_PRACTICES_BODY,
  BEST_PRACTICES_START,
  BEST_PRACTICES_END,
} from '../../commands/agent/init';
import output from '../../output-manager';
import getGlobalPathConfig from '../config/global-path';

const PREVIEW_LINES = 5;
const PREFS_FILE = 'agent-preferences.json';

const AGENT_TO_TARGET: Record<string, string> = {
  [KNOWN_AGENTS.CLAUDE]: 'claude-code',
  [KNOWN_AGENTS.COWORK]: 'claude-code',
  [KNOWN_AGENTS.CURSOR]: 'cursor',
  [KNOWN_AGENTS.CURSOR_CLI]: 'cursor',
};

interface AgentPreferences {
  pluginDismissed?: boolean;
  agentInitDismissed?: boolean;
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
    await writeFile(
      join(getGlobalPathConfig(), PREFS_FILE),
      JSON.stringify(prefs, null, 2),
      'utf-8'
    );
  } catch {
    // ignore
  }
}

function getTargetFile(agentName?: string): string {
  if (agentName === KNOWN_AGENTS.CLAUDE) {
    return 'CLAUDE.md';
  }
  return 'AGENTS.md';
}

function printPreview() {
  const lines = BEST_PRACTICES_BODY.split('\n').filter(l => l.trim() !== '');
  const preview = lines.slice(0, PREVIEW_LINES);
  const remaining = lines.length - PREVIEW_LINES;

  output.log('');
  for (const line of preview) {
    output.log(chalk.dim(`  ${line}`));
  }
  if (remaining > 0) {
    output.log(chalk.dim(`  (+ ${remaining} more lines)`));
  }
  output.log('');
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
  try {
    const raw = await readFile(
      join(homedir(), '.claude', 'plugins', 'installed_plugins.json'),
      'utf-8'
    );
    const data = JSON.parse(raw);
    const plugins: Record<string, unknown> = data?.plugins ?? {};
    return Object.keys(plugins).some(key =>
      key.toLowerCase().includes('vercel-plugin')
    );
  } catch {
    return false;
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
    return isPluginInClaudeRegistry();
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
  if (autoConfirm) {
    return true;
  }
  if (!client.stdin.isTTY) {
    return client.isAgent;
  }
  return client.input.confirm(message, true);
}

export async function autoInstallAgentTooling(
  client: Client,
  options?: { skipAgentInit?: boolean; autoConfirm?: boolean }
): Promise<void> {
  try {
    const prefs = await readPrefs();

    if (!options?.skipAgentInit && !prefs.agentInitDismissed) {
      const targetFile = getTargetFile(client.agentName);
      const filePath = join(client.cwd, targetFile);

      let existing: string | null = null;
      try {
        existing = await readFile(filePath, 'utf-8');
      } catch {
        // file doesn't exist
      }

      const hasMarkers =
        existing !== null &&
        existing.includes(BEST_PRACTICES_START) &&
        existing.includes(BEST_PRACTICES_END);

      if (hasMarkers) {
        // Silently update existing best practices
        await agentInit(client, true);
      } else if (client.isAgent) {
        // Agent — auto-approve
        await agentInit(client, true);
      } else {
        // Human — prompt interactively
        printPreview();
        const accepted = await confirm(
          client,
          `Add Vercel best practices to ${chalk.bold(targetFile)}?`,
          options?.autoConfirm
        );
        if (accepted) {
          await agentInit(client, true);
        } else {
          prefs.agentInitDismissed = true;
          await writePrefs(prefs);
        }
      }
    }

    if (!prefs.pluginDismissed) {
      const targets = await getPluginTargets(client.agentName);
      const uninstalledTargets: string[] = [];
      for (const target of targets) {
        if (!(await isPluginInstalledForTarget(target))) {
          uninstalledTargets.push(target);
        }
      }

      if (uninstalledTargets.length > 0) {
        const accepted = await confirm(
          client,
          'Install the Vercel plugin?',
          options?.autoConfirm
        );
        if (accepted) {
          for (const target of uninstalledTargets) {
            output.spinner(`Installing Vercel plugin for ${target}...`);
            const exitCode = await new Promise<number>(resolve => {
              const child = spawn(
                'npx',
                [
                  'plugins',
                  'add',
                  'vercel/vercel-plugin',
                  '--target',
                  target,
                  '-y',
                ],
                { stdio: 'pipe' }
              );
              child.on('close', c => resolve(c ?? 1));
              child.on('error', () => resolve(1));
            });
            output.stopSpinner();
            if (exitCode === 0) {
              output.success(`Installed Vercel plugin for ${target}`);
            } else {
              output.debug(`Failed to install Vercel plugin for ${target}`);
            }
          }
        } else {
          prefs.pluginDismissed = true;
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
    if (prefs.pluginDismissed) return;

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
