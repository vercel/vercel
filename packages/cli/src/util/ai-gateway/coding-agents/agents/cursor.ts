import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';

/**
 * Cursor stores its BYOK credential and base-URL override in its own
 * account-synced store (not a local config file the CLI can safely write),
 * so this agent provisions the key and walks the user through Cursor's
 * Models settings instead of editing files. The key lands in the shell
 * environment (Keychain-backed where available) so the user can copy it
 * without it ever being printed.
 *
 * The base URL below targets the gateway's Cursor compatibility surface
 * (`/v1/cursor/chat/completions`), which normalizes the Responses-shaped
 * payloads and Anthropic-style tool definitions Cursor sends.
 *
 * Known Cursor limitations (theirs, not ours): BYOK requests route through
 * Cursor's backend, Tab completions never use BYOK, and Agent/Auto modes may
 * bypass the override.
 */
const CURSOR_BASE_URL = 'https://ai-gateway.vercel.sh/v1/cursor';

export const cursor: CodingAgent = {
  id: 'cursor',
  displayName: 'Cursor',
  experimental: true,

  async detect(home) {
    return pathExists(join(home, '.cursor'));
  },

  configPath(ctx) {
    // Cursor has no CLI-writable config; this anchors detection/overrides.
    return ctx.overrides?.['cursor'] ?? join(ctx.home, '.cursor');
  },

  buildPlan(ctx) {
    return {
      fileChanges: [],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        'Cursor keeps its API-key settings in the app itself, so finish the setup there:',
        '1. Open Cursor → Settings (Cmd+Shift+J) → Models.',
        `2. Under OpenAI API Key: paste your gateway key, then enable "Override OpenAI Base URL" and set it to ${ctx.baseUrlOverride ?? CURSOR_BASE_URL}`,
        '3. Copy the key from a new terminal without echoing it: printf %s "$AI_GATEWAY_API_KEY" | pbcopy',
        '4. Use "Add model" to add gateway model ids you want in the picker (e.g. anthropic/claude-fable-5, openai/gpt-5.6-sol).',
        "While the override is on, Cursor's built-in non-OpenAI models stop working — use gateway model ids for everything, or toggle the override off to go back.",
        'Cursor chats are stored by its backend, so there are no local sessions to migrate.',
        'Cursor limitations: Tab completions never use custom keys, and Agent/Auto modes may bypass the override.',
      ],
    };
  },
};
