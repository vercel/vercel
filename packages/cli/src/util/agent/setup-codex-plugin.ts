import execa from 'execa';
import { z } from 'zod';
import type Client from '../client';
import output from '../../output-manager';
import { printAlignedLabel } from '../output/print-aligned-label';
import { codex } from '../ai-gateway/coding-agents/agents/codex';
import type { PluginSetupResult } from './auto-install-agentic';

const MARKETPLACE = 'openai-curated-remote';
const PLUGIN_ID = `vercel@${MARKETPLACE}`;
const INSTALL_COMMAND = `codex plugin add ${PLUGIN_ID}`;
const SIGN_IN_MESSAGE =
  "Can't install the Vercel plugin for Codex without a ChatGPT sign-in. Run `codex login`, then `vercel setup plugin --agent codex`.";

// This is Codex's native marketplace plugin. Its releases are independent of
// the Claude marketplace, so don't compare it to vercel-plugin/main's version.
const pluginListSchema = z.object({
  installed: z.array(
    z.object({
      pluginId: z.string(),
      enabled: z.boolean(),
      version: z.string().nullable().optional(),
    })
  ),
});

async function runCodex(args: string[]): Promise<string> {
  const { stdout } = await execa('codex', args, {
    encoding: 'utf8',
    stdin: 'ignore',
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

// The OpenAI marketplace serves plugins only to Codex signed in with ChatGPT,
// not to an API key or a signed-out Codex.
function needsChatGptSignIn(err: unknown): boolean {
  const { message, stderr } = err as { message?: unknown; stderr?: unknown };
  return [message, stderr].some(
    text =>
      typeof text === 'string' && /chatgpt authentication required/i.test(text)
  );
}

async function installedPlugin() {
  const stdout = await runCodex([
    'plugin',
    'list',
    '--marketplace',
    MARKETPLACE,
    '--json',
  ]);
  const { installed } = pluginListSchema.parse(JSON.parse(stdout));
  return installed.find(plugin => plugin.pluginId === PLUGIN_ID);
}

export async function setupCodexPlugin(
  client: Client,
  opts: { yes: boolean; dryRun: boolean; canPrompt: boolean; home: string }
): Promise<PluginSetupResult> {
  if (!(await codex.detect(opts.home))) {
    return {
      status: 'not_detected',
      message: 'Codex was not detected on this machine.',
    };
  }

  let before;
  try {
    before = await installedPlugin();
  } catch (err) {
    return {
      status: 'failed',
      message: needsChatGptSignIn(err)
        ? SIGN_IN_MESSAGE
        : "Couldn't inspect Codex plugins. Install or update the Codex CLI, sign in with `codex login`, then re-run `vercel setup plugin --agent codex`.",
    };
  }

  if (before?.enabled) {
    const version = before.version ? ` (v${before.version})` : '';
    return {
      status: 'up_to_date',
      message: `Vercel plugin for Codex is installed${version}.`,
    };
  }

  const action = before ? 'enable' : 'install';
  if (opts.dryRun) {
    return {
      status: 'dry_run',
      action,
      message: `Setup would ${action} the Vercel plugin for Codex from the OpenAI marketplace.`,
    };
  }
  if (!opts.yes) {
    if (!opts.canPrompt) {
      return {
        status: 'confirmation_required',
        message: `Re-run with --yes to ${action} the Vercel plugin for Codex.`,
      };
    }
    printAlignedLabel('Plugin', 'Vercel for Codex (OpenAI marketplace)');
    const accepted = await client.input.confirm(
      before ? 'Enable this plugin?' : 'Install this plugin?',
      true
    );
    if (!accepted) {
      return {
        status: 'declined',
        message: 'Skipped the Vercel plugin for Codex.',
      };
    }
  }

  output.spinner(
    `${before ? 'Enabling' : 'Installing'} the Vercel plugin for Codex…`
  );
  try {
    const stdout = await runCodex(['plugin', 'add', PLUGIN_ID, '--json']);
    const install = z
      .object({ appsNeedingAuth: z.array(z.unknown()).optional() })
      .parse(JSON.parse(stdout));
    const after = await installedPlugin();
    if (!after?.enabled) {
      return {
        status: 'failed',
        message:
          "The Vercel plugin is not enabled in Codex. Open Codex's /plugins browser, enable Vercel, then re-run `vercel setup plugin --agent codex`.",
      };
    }
    const version = after.version ? ` v${after.version}` : '';
    const connection = install.appsNeedingAuth?.length
      ? " Connect Vercel in Codex's /plugins browser to use its connected tools."
      : ' Start a new Codex session to load the plugin.';
    return {
      status: before ? 'enabled' : 'installed',
      message: `${before ? 'Enabled' : 'Installed'} the Vercel plugin for Codex${version}.${connection}`,
    };
  } catch (err) {
    return {
      status: 'failed',
      message: needsChatGptSignIn(err)
        ? SIGN_IN_MESSAGE
        : `Failed to set up the Vercel plugin for Codex. Run \`${INSTALL_COMMAND}\` to finish setup in Codex.`,
    };
  } finally {
    output.stopSpinner();
  }
}
