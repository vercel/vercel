import { join } from 'node:path';
import type { CodingAgent } from '../types';
import { pathExists } from '../config-files';
import { GATEWAY_CODING_AGENT_BASE_URL } from '../gateway';

/**
 * Cursor keeps BYOK settings in its account-synced store, so there is no
 * config file to write. Setup provisions the key into the shell environment
 * and walks the user through Cursor's Models settings. Cursor limitations:
 * BYOK routes through Cursor's backend, Tab never uses BYOK, and Agent/Auto
 * may bypass the override.
 */
export const cursor: CodingAgent = {
  id: 'cursor',
  displayName: 'Cursor',
  experimental: true,

  async detect(home) {
    return pathExists(join(home, '.cursor'));
  },

  configPath(ctx) {
    return ctx.overrides?.['cursor'] ?? join(ctx.home, '.cursor');
  },

  buildPlan(ctx) {
    return {
      fileChanges: [],
      envExports: [{ name: 'AI_GATEWAY_API_KEY', value: ctx.apiKey }],
      notes: [
        'Cursor keeps its API-key settings in the app itself, so finish the setup there:',
        '1. Open Cursor → Settings (Cmd+Shift+J) → Models.',
        `2. Under OpenAI API Key: paste your gateway key, then enable "Override OpenAI Base URL" and set it to ${ctx.baseUrlOverride ?? GATEWAY_CODING_AGENT_BASE_URL}`,
        '3. Copy the key from a new terminal without echoing it: printf %s "$AI_GATEWAY_API_KEY" | pbcopy',
        '4. Use "Add model" to add gateway model ids you want in the picker (e.g. anthropic/claude-fable-5, openai/gpt-5.6-sol).',
        "While the override is on, Cursor's built-in non-OpenAI models stop working — use gateway model ids for everything, or toggle the override off to go back.",
        'Cursor chats are stored by its backend, so there are no local sessions to migrate.',
        'Cursor limitations: Tab completions never use custom keys, and Agent/Auto modes may bypass the override.',
      ],
    };
  },
};
