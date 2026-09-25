import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CodingAgent } from '../types';
import { mergeToml, pathExists } from '../config-files';
import { GATEWAY_ANTHROPIC_BASE_URL } from '../gateway';

const PROJECT_AUTH_NOTICE =
  'Project settings can override API key authentication. For affected projects, set claude_provider and codex_provider to "custom" in <repo>/.conductor/settings.local.toml.';

/**
 * Conductor's managed TOML overrides user and project settings. Its Codex
 * integration recognizes the exact /v1 URL below and supplies its own provider
 * configuration; the standalone Codex /codex/v1 endpoint does not work here.
 * Managed environment values are literal strings, not shell/Keychain lookups.
 * User settings must also select custom providers: CLI auth mode strips the
 * gateway URL and credentials before launching Codex. These are defaults;
 * project provider settings take precedence and cannot be locked by the
 * supported managed settings schema.
 *
 * This configures local Claude Code/Codex routing and Enterprise Data Privacy.
 * Conductor does not expose a supported global harness allowlist: in particular,
 * clearing CURSOR_API_KEY can still fall back to a saved Cursor credential.
 * Never describe these settings as enforcing gateway-only access for the app.
 *
 * https://www.conductor.build/docs/guides/providers
 * https://www.conductor.build/docs/reference/settings/managed
 * https://www.conductor.build/docs/reference/privacy#enterprise-data-privacy
 */
export const conductor: CodingAgent = {
  id: 'conductor',
  displayName: 'Conductor',
  supportsPrompt: false,

  async detect(home) {
    return pathExists(join(home, '.conductor'));
  },

  configPath(ctx) {
    return (
      ctx.overrides?.conductor ??
      join(ctx.home, '.conductor', 'settings.managed.toml')
    );
  },

  async warnings() {
    return [
      {
        code: 'conductor_gateway_only_not_enforced',
        impact:
          'Conductor setup configures Claude Code and Codex defaults, but cannot enforce gateway-only access for every project or harness.',
        why: [
          'Cursor can still use a saved credential, and OpenCode providers are configured separately.',
          'Managed settings apply to all local projects and enable Enterprise Data Privacy, disabling AI-generated chat titles and custom MCP servers. Cloud workspaces are not covered.',
          'Default Claude Code and Codex authentication switches to API key mode in Conductor user settings.',
          PROJECT_AUTH_NOTICE,
          'Conductor needs a literal gateway key in its managed settings file, even when Keychain storage is enabled. Settings and backups written by setup use owner-only permissions.',
        ],
        undo: 'restore the managed and user settings backups, or remove the entries added by setup',
        confirm:
          'Configure local Claude Code/Codex defaults and enable Enterprise Data Privacy?',
      },
    ];
  },

  buildPlan(ctx) {
    const path = this.configPath(ctx);
    const userPath = join(dirname(path), 'settings.toml');
    // Creating TOML must not shadow settings still stored in legacy JSON.
    const checkLegacySettings = (
      current: string | null,
      legacyName: string
    ) => {
      if (current === null && existsSync(join(dirname(path), legacyName))) {
        throw new Error(
          `Conductor has legacy ${legacyName}. Migrate it to ${legacyName.replace('.json', '.toml')} before running setup.`
        );
      }
    };
    return {
      fileChanges: [
        {
          path,
          label: 'Conductor managed settings',
          format: 'toml',
          mode: 0o600,
          transform: current => {
            checkLegacySettings(current, 'settings.managed.json');
            return mergeToml(current, {
              enterprise_data_privacy: true,
              environmentVariables: {
                local: {
                  ANTHROPIC_BASE_URL: GATEWAY_ANTHROPIC_BASE_URL,
                  ANTHROPIC_AUTH_TOKEN: ctx.apiKey,
                  ANTHROPIC_API_KEY: '',
                  CLAUDE_CODE_OAUTH_TOKEN: '',
                  CLAUDE_CODE_USE_BEDROCK: '0',
                  CLAUDE_CODE_USE_VERTEX: '0',
                  CLAUDE_CODE_USE_FOUNDRY: '0',
                  CLAUDE_CODE_USE_ANTHROPIC_AWS: '0',
                  CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD: '0',
                  CLAUDE_CODE_USE_MANTLE: '0',
                  OPENAI_BASE_URL: `${GATEWAY_ANTHROPIC_BASE_URL}/v1`,
                  AI_GATEWAY_API_KEY: ctx.apiKey,
                  // Conductor passes Codex credentials separately from general
                  // environment variables, then restores the gateway env key
                  // from that credential when launching the native harness.
                  CODEX_API_KEY: ctx.apiKey,
                  OPENAI_API_KEY: '',
                },
              },
            });
          },
        },
        {
          path: userPath,
          label: 'Conductor authentication settings',
          format: 'toml',
          mode: 0o600,
          transform: current => {
            checkLegacySettings(current, 'settings.json');
            return mergeToml(current, {
              claude_provider: 'custom',
              codex_provider: 'custom',
            });
          },
        },
      ],
      envExports: [],
      notes: [
        'Default Claude Code and Codex authentication is API key mode in Conductor Settings > Agents.',
        PROJECT_AUTH_NOTICE,
        'Restart Conductor and start new local Claude Code or Codex chats to use the AI Gateway.',
        'Enterprise Data Privacy is enabled through managed settings for this Mac. The gateway key belongs to the Vercel team selected for setup.',
        'Gateway-only access is not enforced for Cursor, separately configured OpenCode providers, or cloud workspaces.',
      ],
    };
  },
};
