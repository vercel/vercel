import { isAbsolute, join } from 'node:path';
import execa from 'execa';
import { parse as jsoncParse, type ParseError } from 'jsonc-parser';
import type Client from '../client';
import output from '../../output-manager';
import { printAlignedLabel } from '../output/print-aligned-label';
import { readFileOrNull } from '../ai-gateway/coding-agents/config-files';
import type { PluginSetupResult } from './auto-install-agentic';

const PLUGIN_SOURCE = 'github:vercel/vercel-plugin';
const PLUGIN_ID = 'vercel-plugin';

async function openCodeMajorVersion(): Promise<number | undefined> {
  try {
    const { stdout } = await execa('opencode', ['--version'], {
      stdin: 'ignore',
      timeout: 10_000,
    });
    const match = /(\d+)\.\d+\.\d+/.exec(stdout);
    return match ? Number(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function selectsPlugin(selector: string): boolean {
  return (
    selector === '*' ||
    (selector.endsWith('.*')
      ? PLUGIN_ID.startsWith(selector.slice(0, -1))
      : selector === PLUGIN_ID)
  );
}

type PluginConfigState =
  | { status: 'missing' | 'enabled' }
  | { status: 'disabled'; rule: string; file: string };

// Read the global config instead of running `opencode plugin list`, which
// starts the OpenCode background service. Mirrors OpenCode's ordered plugin
// rules: https://opencode.ai/v2/docs/plugins#control
async function pluginConfigState(home: string): Promise<PluginConfigState> {
  const xdg = process.env.XDG_CONFIG_HOME;
  const dir =
    process.env.OPENCODE_CONFIG_DIR ||
    join(xdg && isAbsolute(xdg) ? xdg : join(home, '.config'), 'opencode');
  let state: PluginConfigState = { status: 'missing' };
  for (const file of ['opencode.json', 'opencode.jsonc']) {
    const path = join(dir, file);
    const text = await readFileOrNull(path);
    if (!text) continue;
    const errors: ParseError[] = [];
    const config = jsoncParse(text, errors, { allowTrailingComma: true });
    // OpenCode ignores a malformed document.
    if (errors.length > 0 || !Array.isArray(config?.plugins)) continue;
    const plugins: Array<string | { package?: string }> = config.plugins;
    for (const entry of plugins) {
      if (typeof entry === 'string' && entry.startsWith('-')) {
        if (state.status !== 'missing' && selectsPlugin(entry.slice(1))) {
          state = { status: 'disabled', rule: entry, file: path };
        }
        continue;
      }
      const target = typeof entry === 'string' ? entry : entry?.package;
      if (
        target === PLUGIN_SOURCE ||
        (state.status !== 'missing' && target && selectsPlugin(target))
      ) {
        state = { status: 'enabled' };
      }
    }
  }
  return state;
}

export async function setupOpenCodePlugin(
  client: Client,
  opts: { yes: boolean; dryRun: boolean; canPrompt: boolean; home: string }
): Promise<PluginSetupResult> {
  const majorVersion = await openCodeMajorVersion();
  if (majorVersion === undefined) {
    return {
      status: 'not_detected',
      message: 'OpenCode was not detected on this machine.',
    };
  }
  if (majorVersion < 2) {
    return {
      status: 'unsupported',
      message:
        'The Vercel plugin needs OpenCode 2. Upgrade OpenCode, then re-run `vercel setup plugin --agent opencode`.',
    };
  }
  const state = await pluginConfigState(opts.home);
  if (state.status === 'disabled') {
    return {
      status: 'disabled',
      message: `The Vercel plugin is disabled by "${state.rule}" in ${state.file}. Remove that entry or add "${PLUGIN_ID}" after it to enable the plugin.`,
    };
  }
  if (state.status === 'enabled') {
    return {
      status: 'up_to_date',
      message: 'Vercel plugin for OpenCode is installed.',
    };
  }
  if (opts.dryRun) {
    return {
      status: 'dry_run',
      action: 'install',
      message: 'Setup would install the Vercel plugin for OpenCode.',
    };
  }
  if (!opts.yes) {
    if (!opts.canPrompt) {
      return {
        status: 'confirmation_required',
        message: 'Re-run with --yes to install the Vercel plugin for OpenCode.',
      };
    }
    printAlignedLabel('Plugin', `Vercel for OpenCode (${PLUGIN_SOURCE})`);
    if (!(await client.input.confirm('Install this plugin?', true))) {
      return {
        status: 'declined',
        message: 'Skipped the Vercel plugin for OpenCode.',
      };
    }
  }

  output.spinner('Installing the Vercel plugin for OpenCode…');
  try {
    await execa('opencode', ['plugin', 'add', PLUGIN_SOURCE], {
      stdin: 'ignore',
      timeout: 120_000,
    });
  } catch {
    return {
      status: 'failed',
      message: `Failed to install the Vercel plugin for OpenCode. Run \`opencode plugin add ${PLUGIN_SOURCE}\` to finish setup.`,
    };
  } finally {
    output.stopSpinner();
  }
  return {
    status: 'installed',
    message:
      'Installed the Vercel plugin for OpenCode. Restart OpenCode, then run /mcps to sign in to the Vercel MCP server.',
  };
}
