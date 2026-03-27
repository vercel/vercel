import { readFile, writeFile, readdir } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import type Client from '../client';
import output from '../../output-manager';
import getGlobalPathConfig from '../config/global-path';

const PREFS_FILE = 'agent-preferences.json';

const AGENT_TO_TARGET: Record<string, string> = {
  [KNOWN_AGENTS.CLAUDE]: 'claude-code',
  [KNOWN_AGENTS.COWORK]: 'claude-code',
  [KNOWN_AGENTS.CURSOR]: 'cursor',
  [KNOWN_AGENTS.CURSOR_CLI]: 'cursor',
};

interface AgentPreferences {
  pluginDismissed?: boolean;
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
  if (autoConfirm && !client.isAgent) {
    return true;
  }
  if (!client.stdin.isTTY) {
    return false;
  }
  return client.input.confirm(message, true);
}

export async function autoInstallAgentTooling(
  client: Client,
  options?: { autoConfirm?: boolean }
): Promise<void> {
  try {
    const prefs = await readPrefs();

    output.debug(
      `[plugin] prefs=${JSON.stringify(prefs)} agentName=${client.agentName ?? 'none'} isAgent=${client.isAgent} isTTY=${client.stdin.isTTY}`
    );
    if (!prefs.pluginDismissed) {
      const targets = await getPluginTargets(client.agentName);
      output.debug(`[plugin] targets=${JSON.stringify(targets)}`);
      const uninstalledTargets: string[] = [];
      for (const target of targets) {
        const installed = await isPluginInstalledForTarget(target);
        output.debug(`[plugin] ${target} installed=${installed}`);
        if (!installed) {
          uninstalledTargets.push(target);
        }
      }
      output.debug(
        `[plugin] uninstalled=${JSON.stringify(uninstalledTargets)}`
      );

      if (uninstalledTargets.length > 0) {
        output.debug(
          `[plugin] entering install branch, isAgent=${client.isAgent} isTTY=${client.stdin.isTTY}`
        );
        // Agents in non-TTY: output structured JSON so agent prompts the user
        if (client.isAgent && !client.stdin.isTTY) {
          const next = uninstalledTargets.map(target => ({
            command: `npx plugins add vercel/vercel-plugin --target ${target} -y`,
            when: `Install Vercel plugin for ${target}`,
          }));
          client.stdout.write(
            `${JSON.stringify(
              {
                status: 'action_required',
                reason: 'plugin_install',
                message:
                  'The Vercel plugin enhances your agent experience. Would you like to install it?',
                next,
              },
              null,
              2
            )}\n`
          );
          // Dismiss so we don't ask again on next login/link
          prefs.pluginDismissed = true;
          await writePrefs(prefs);
          return;
        }

        const targetList = uninstalledTargets.join(', ');
        output.log(
          `The Vercel plugin installs on your agent harness (${targetList}) to give your AI agent the ability to manage deployments, environments, and more.`
        );
        const accepted = await confirm(
          client,
          'Install the Vercel plugin?',
          options?.autoConfirm
        );
        if (accepted) {
          let interrupted = false;
          for (const target of uninstalledTargets) {
            if (interrupted) break;
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
              const onSigint = () => {
                interrupted = true;
                child.kill();
              };
              process.once('SIGINT', onSigint);
              child.on('close', c => {
                process.removeListener('SIGINT', onSigint);
                resolve(c ?? 1);
              });
              child.on('error', () => {
                process.removeListener('SIGINT', onSigint);
                resolve(1);
              });
            });
            output.stopSpinner();
            if (interrupted) {
              output.log('Plugin installation cancelled.');
              break;
            }
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
