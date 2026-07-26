import { describe, expect, it } from 'vitest';
import { parse as tomlParse } from 'smol-toml';
import {
  codex,
  codexAuthConfig,
} from '../../../../src/util/ai-gateway/coding-agents/agents/codex';

describe('Codex AI Gateway setup', () => {
  it('uses command-backed auth so Codex fetches the remote model catalog', () => {
    const plan = codex.buildPlan({
      apiKey: 'vck_TestKey',
      home: '/home/test',
    });
    const config = tomlParse(plan.fileChanges[0].transform(null)) as Record<
      string,
      any
    >;

    expect(config.model_provider).toBe('vercel');
    expect(config.model_providers.vercel.base_url).toBe(
      'https://ai-gateway.vercel.sh/codex/v1'
    );
    expect(config.model_providers.vercel.env_key).toBeUndefined();
    expect(config.model_providers.vercel.auth).toEqual(
      codexAuthConfig(process.platform)
    );
    expect(plan.envExports).toEqual([
      { name: 'AI_GATEWAY_API_KEY', value: 'vck_TestKey' },
    ]);
  });

  it('migrates env_key auth without clobbering user settings', () => {
    const current = [
      'model = "openai/gpt-5.4"  # keep my model',
      '',
      '[model_providers.vercel]',
      'name = "Old name"',
      'env_key = "AI_GATEWAY_API_KEY"',
      'query_params = "keep"',
      '',
    ].join('\n');
    const plan = codex.buildPlan({
      apiKey: 'vck_TestKey',
      home: '/home/test',
    });
    const next = plan.fileChanges[0].transform(current);
    const config = tomlParse(next) as Record<string, any>;

    expect(next).toContain('model = "openai/gpt-5.4"  # keep my model');
    expect(config.model_providers.vercel.query_params).toBe('keep');
    expect(config.model_providers.vercel.env_key).toBeUndefined();
    expect(config.model_providers.vercel.auth).toEqual(
      codexAuthConfig(process.platform)
    );
  });

  it('uses platform-native commands without writing the key to TOML', () => {
    expect(codexAuthConfig('linux')).toEqual({
      command: '/bin/sh',
      args: ['-c', `printf '%s' "$AI_GATEWAY_API_KEY"`],
      refresh_interval_ms: 0,
    });
    expect(codexAuthConfig('win32')).toEqual({
      command: 'powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::Out.Write($env:AI_GATEWAY_API_KEY)',
      ],
      refresh_interval_ms: 0,
    });
  });
});
