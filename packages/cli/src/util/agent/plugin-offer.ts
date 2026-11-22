import { homedir } from 'node:os';
import ciInfo from 'ci-info';
import {
  readGlobalConfigFile,
  writeGlobalConfigFile,
} from '@vercel/cli-config';
import type Client from '../client';
import output from '../../output-manager';
import { getConfigFilePath } from '../config/files';
import { parseArguments } from '../get-args';
import { isPromptCanceledError } from '../input/prompt-cancellation';
import { wantsMachineReadableOutput } from '../output-format';
import { getCommandName } from '../pkg-name';
import { claudeCode } from '../ai-gateway/coding-agents/agents/claude-code';
import {
  getSavedPluginAnswer,
  hasClaudeVercelPlugin,
  savePluginAnswer,
  setupVercelPlugin,
} from './auto-install-agentic';
import { setupCodexPlugin } from './setup-codex-plugin';

/** Long enough to answer, short enough that an unattended run moves on. */
export const PLUGIN_OFFER_TIMEOUT_MS = 30_000;

/** How long to read and drop keys typed while the command ran. */
const TYPE_AHEAD_WINDOW_MS = 50;

type PluginSetup = typeof setupVercelPlugin;

/**
 * Offers the Vercel plugin once, after a first-time user's first successful
 * interactive command. Runs that can't prompt (agents, CI, scripts, `--json`)
 * skip it and leave the offer for that first interactive run, so they never
 * wait on a prompt. An unanswered prompt is skipped after
 * `PLUGIN_OFFER_TIMEOUT_MS`, for a harness that gives the CLI a terminal
 * without identifying itself as an agent.
 */
export async function offerVercelPluginToNewUser(
  client: Client,
  exitCode: number | undefined,
  command: string | undefined
): Promise<void> {
  if (
    client.config.usedBefore !== false ||
    exitCode !== 0 ||
    // Help and `--version` finish without running a command, except for
    // commands that render their own help, so check the flags too.
    !command ||
    client.argv.includes('--help') ||
    client.argv.includes('-h') ||
    isPull(client, command) ||
    !isInteractiveHumanRun(client, command)
  ) {
    return;
  }

  markUsedBefore(client);
  // `vercel setup` is the explicit way to install the plugin.
  if (
    command === 'setup' ||
    (await getSavedPluginAnswer(client)) !== undefined
  ) {
    return;
  }

  const home = homedir();
  const setups = await getSetupsForMissingPlugins(client, home);
  if (setups.length === 0) {
    return;
  }

  await discardTypeAhead(client);
  output.print('\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLUGIN_OFFER_TIMEOUT_MS);
  // Ctrl+C closes the prompt without settling it, so the timer must not keep
  // the CLI running.
  timer.unref();
  let accepted: boolean;
  try {
    accepted = await client.input.confirm(
      'Install Vercel Plugin for coding agents?',
      true,
      { signal: controller.signal }
    );
  } catch (err) {
    if (controller.signal.aborted) {
      output.log(
        `No answer after ${PLUGIN_OFFER_TIMEOUT_MS / 1000} seconds. Run ${getCommandName('setup plugin')} to install it later.`
      );
      return;
    }
    if (isPromptCanceledError(err)) {
      return;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  await savePluginAnswer(client, accepted);
  if (!accepted) {
    return;
  }

  for (const setup of setups) {
    const result = await setup(client, {
      yes: true,
      dryRun: false,
      canPrompt: false,
      home,
    });
    output.print(`  ${result.message}\n`);
  }
}

/**
 * Drops keys typed while the command ran. The terminal buffers them and the
 * prompt would read them, so a stray Enter would accept the default and
 * install plugins without the user choosing to.
 */
async function discardTypeAhead(client: Client): Promise<void> {
  const { stdin } = client;
  const wasRaw = stdin.isRaw === true;
  // Raw mode also releases a partly typed line.
  stdin.setRawMode?.(true);
  const discard = () => {};
  stdin.on('data', discard);
  stdin.resume();
  await new Promise(resolve => setTimeout(resolve, TYPE_AHEAD_WINDOW_MS));
  stdin.off('data', discard);
  stdin.pause();
  stdin.setRawMode?.(wasRaw);
}

// `vercel pull` and `vercel env pull` run in setup scripts, often in a
// terminal, where the offer would wait for an answer.
function isPull(client: Client, command: string): boolean {
  return (
    command === 'pull' ||
    (command === 'env' &&
      parseArguments(client.argv, {}, { permissive: true }).args[3] === 'pull')
  );
}

// The design guide's gate for optional offers: interactive human mode only.
function isInteractiveHumanRun(client: Client, command: string): boolean {
  return (
    !client.isAgent &&
    !client.nonInteractive &&
    !ciInfo.isCI &&
    client.stdin.isTTY === true &&
    client.stderr.isTTY === true &&
    !wantsMachineReadableOutput(command, client.argv)
  );
}

/**
 * Re-reads the config file and changes only `usedBefore`, so invocation
 * overrides held in `client.config` (`--scope`, a linked project's team) are
 * never persisted.
 */
function markUsedBefore(client: Client): void {
  client.config.usedBefore = true;
  try {
    const configPath = getConfigFilePath();
    writeGlobalConfigFile(configPath, {
      ...readGlobalConfigFile(configPath),
      usedBefore: true,
    });
  } catch (err) {
    output.debug(`Failed to save usedBefore: ${err}`);
  }
}

async function getSetupsForMissingPlugins(
  client: Client,
  home: string
): Promise<PluginSetup[]> {
  const [claudeMissing, codexMissing] = await Promise.all([
    (async () =>
      (await claudeCode.detect(home)) &&
      !(await hasClaudeVercelPlugin(home)))(),
    // A Codex that can't list its plugins (signed out, too old) still gets the
    // offer; its setup result says what to fix.
    setupCodexPlugin(client, {
      yes: false,
      dryRun: true,
      canPrompt: false,
      home,
    }).then(({ status }) => status === 'dry_run' || status === 'failed'),
  ]);
  const setups: PluginSetup[] = [];
  if (claudeMissing) setups.push(setupVercelPlugin);
  if (codexMissing) setups.push(setupCodexPlugin);
  return setups;
}
