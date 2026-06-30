import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { client } from '../../../mocks/client';
import aiGateway from '../../../../src/commands/ai-gateway';
import { useUser } from '../../../mocks/user';
import { detectShellRc } from '../../../../src/util/ai-gateway/coding-agents/apply';
import {
  mergeJson,
  upsertManagedBlock,
} from '../../../../src/util/ai-gateway/coding-agents/config-files';

let home: string;
let savedEnv: Record<string, string | undefined>;

function claudeSettingsPath() {
  return join(home, '.claude', 'settings.json');
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'vc-setup-agents-'));
  savedEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    SHELL: process.env.SHELL,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.SHELL = '/bin/bash';
  for (const v of ['XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR']) {
    delete process.env[v];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('ai-gateway coding-agents setup', () => {
  describe('--help', () => {
    it('returns exit code 2', async () => {
      client.setArgv('ai-gateway', 'coding-agents', 'setup', '--help');
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(2);
    });
  });

  describe('non-interactive with an existing key', () => {
    it('configures Claude Code and emits JSON with the key', async () => {
      useUser();
      client.nonInteractive = true;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0001',
        '--agent',
        'claude-code'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      expect(settings.env.ANTHROPIC_BASE_URL).toBe(
        'https://ai-gateway.vercel.sh'
      );
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_DummyKey0001');
      expect(settings.env.ANTHROPIC_API_KEY).toBe('');

      const out = JSON.parse(client.stdout.getFullOutput());
      expect(out.status).toBe('ok');
      expect(out.reason).toBe('coding_agents_configured');
      expect(out.apiKey).toBe('vck_DummyKey0001');
      expect(out.configured).toHaveLength(1);
      expect(out.configured[0].action).toBe('created');
    });
  });

  describe('an existing key is required', () => {
    it('errors when --key is omitted', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'existing AI Gateway API key is required'
      );
    });
  });

  describe('idempotency', () => {
    it('is a no-op on the second run with the same key', async () => {
      useUser();
      client.nonInteractive = true;
      const argv = [
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0005',
        '--agent',
        'claude-code',
      ] as const;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const first = readFileSync(claudeSettingsPath(), 'utf8');
      const stdoutAfterFirst = client.stdout.getFullOutput().length;

      client.setArgv(...argv);
      expect(await aiGateway(client)).toBe(0);
      const second = readFileSync(claudeSettingsPath(), 'utf8');

      expect(second).toBe(first);
      const secondJson = client.stdout.getFullOutput().slice(stdoutAfterFirst);
      const out = JSON.parse(secondJson);
      expect(out.configured).toHaveLength(0);
    });
  });

  describe('safety', () => {
    it('skips a malformed config instead of clobbering it', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(claudeSettingsPath(), '{ this is not json', 'utf8');

      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_DummyKey0006',
        '--agent',
        'claude-code'
      );
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      // File untouched.
      expect(readFileSync(claudeSettingsPath(), 'utf8')).toBe(
        '{ this is not json'
      );
      const out = JSON.parse(client.stdout.getFullOutput());
      expect(
        out.skipped.some((s: any) => s.reason === 'unparseable_config')
      ).toBe(true);
    });

    it('never prints the full key — only a masked form', async () => {
      useUser();
      const secret = 'vck_SuperSecretValue98765';
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        secret,
        '--agent',
        'claude-code',
        '--yes'
      );

      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('vck_••••8765');
      expect(stderr).not.toContain(secret);
      expect(client.stdout.getFullOutput()).not.toContain(secret);
    });
  });

  describe('receipt layout', () => {
    it('prints one ✓ Connected row; files and key are secondary rows', async () => {
      useUser();
      client.nonInteractive = false;
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_ReceiptKey0001x',
        '--agent',
        'claude-code',
        '--yes'
      );

      expect(await aiGateway(client)).toBe(0);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('✓ Connected');
      // Exactly one ✓ — file rows and the key row keep the blank gutter.
      expect(stderr.match(/✓/g)).toHaveLength(1);
      expect(stderr).toMatch(/^ {2}Created {9}/m);
      expect(stderr).toMatch(/^ {2}API Key {9}vck_/m);
      expect(stderr).not.toContain('WARNING!');
    });
  });

  describe('validation', () => {
    it('rejects an unknown agent', async () => {
      useUser();
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--agent',
        'bogus',
        '--key',
        'vck_x'
      );
      const exitCode = await aiGateway(client);
      expect(exitCode).toBe(1);
      expect(client.stderr.getFullOutput()).toContain('Unknown agent');
    });
  });

  describe('existing config is merged, not clobbered', () => {
    it('preserves unrelated keys in an existing settings.json', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        claudeSettingsPath(),
        JSON.stringify({ env: { FOO: 'bar' }, theme: 'dark' }, null, 2),
        'utf8'
      );
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_MergeKey0001',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);

      const settings = JSON.parse(readFileSync(claudeSettingsPath(), 'utf8'));
      // Pre-existing user settings survive the merge…
      expect(settings.theme).toBe('dark');
      expect(settings.env.FOO).toBe('bar');
      // …and the gateway keys land alongside them.
      expect(settings.env.ANTHROPIC_BASE_URL).toBe(
        'https://ai-gateway.vercel.sh'
      );
      expect(settings.env.ANTHROPIC_AUTH_TOKEN).toBe('vck_MergeKey0001');
    });

    it('keeps the existing file formatting; only the added keys change the file', async () => {
      useUser();
      client.nonInteractive = true;
      mkdirSync(join(home, '.claude'), { recursive: true });
      // Deliberately 4-space indented — the merge must follow the file's own
      // style instead of reformatting it to ours.
      const original = [
        '{',
        '    "theme": "dark",',
        '    "env": {',
        '        "FOO": "bar"',
        '    }',
        '}',
        '',
      ].join('\n');
      writeFileSync(claudeSettingsPath(), original, 'utf8');
      client.setArgv(
        'ai-gateway',
        'coding-agents',
        'setup',
        '--key',
        'vck_FormatKey01',
        '--agent',
        'claude-code'
      );

      expect(await aiGateway(client)).toBe(0);

      const next = readFileSync(claudeSettingsPath(), 'utf8');
      // Untouched lines are byte-identical (4-space indent survives)…
      expect(next).toContain('    "theme": "dark",');
      expect(next).toContain('        "FOO": "bar"');
      // …and inserted keys follow the file's indentation, not our default.
      expect(next).toContain('        "ANTHROPIC_BASE_URL"');
      // No line was re-indented to our 2-space default.
      expect(next).not.toMatch(/^ {2}"/m);
    });
  });

  describe('mergeJson edits in place', () => {
    it('leaves a minified file on one line, untouched content byte-identical', () => {
      const current =
        '{"mcp":{"devbox":{"command":["/x/devbox","mcp"],"enabled":true}}}';
      const next = mergeJson(current, { provider: { vercel: {} } });
      expect(next).toContain(
        '{"mcp":{"devbox":{"command":["/x/devbox","mcp"],"enabled":true}}'
      );
      expect(next.trim()).not.toContain('\n');
      expect(JSON.parse(next)).toEqual({
        mcp: { devbox: { command: ['/x/devbox', 'mcp'], enabled: true } },
        provider: { vercel: {} },
      });
    });

    it('returns the input byte-for-byte when every value already matches', () => {
      const current = '{\n\t"env": {\n\t\t"A": "b"\n\t},\n\t"x": 1\n}\n';
      expect(mergeJson(current, { env: { A: 'b' } })).toBe(current);
    });

    it('does not clobber an existing object with an empty-object patch', () => {
      const current = '{"provider":{"vercel":{"options":{"apiKey":"vck_1"}}}}';
      expect(mergeJson(current, { provider: { vercel: {} } })).toBe(current);
    });

    it('replaces a changed value in place', () => {
      const current = '{\n  "env": {\n    "TOKEN": "vck_old"\n  }\n}\n';
      expect(mergeJson(current, { env: { TOKEN: 'vck_new' } })).toBe(
        '{\n  "env": {\n    "TOKEN": "vck_new"\n  }\n}\n'
      );
    });

    it('preserves CRLF line endings', () => {
      const current = '{\r\n  "a": 1\r\n}\r\n';
      const next = mergeJson(current, { env: { K: 'v' } });
      expect(next).toContain('\r\n');
      expect(next.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it('still rejects invalid JSON and non-object roots', () => {
      expect(() => mergeJson('{ nope', { a: 1 })).toThrow(
        /existing file is not valid JSON/
      );
      expect(() => mergeJson('[1, 2]', { a: 1 })).toThrow(
        /existing file is not a JSON object/
      );
    });

    it('falls back to a rewrite for duplicate keys instead of a dead edit', () => {
      // jsonc-parser edits the first duplicate, JSON.parse keeps the last —
      // the in-place edit would land in the object nobody reads. The verify
      // step must catch that and take the plain rewrite.
      const current = '{"env":{"A":"1"},"theme":"dark","env":{"B":"2"}}';
      const next = mergeJson(current, { env: { TOKEN: 'vck_x' } });
      const parsed = JSON.parse(next);
      expect(parsed.env).toEqual({ B: '2', TOKEN: 'vck_x' });
      expect(parsed.theme).toBe('dark');

      // A duplicate whose first occurrence is not even an object used to make
      // the editor throw; it must fall back instead of erroring the plan.
      const hostile = '{"env":"weird","env":{"B":"2"}}';
      const fixed = JSON.parse(mergeJson(hostile, { env: { TOKEN: 'vck_x' } }));
      expect(fixed.env).toEqual({ B: '2', TOKEN: 'vck_x' });
    });
  });

  describe('shell rc managed block', () => {
    it('replaces an existing block in place, leaving surrounding lines intact', () => {
      const before = [
        '# my rc',
        'export PATH="$PATH:/usr/local/bin"',
        '# >>> vercel ai-gateway >>>',
        "export AI_GATEWAY_API_KEY='old'",
        '# <<< vercel ai-gateway <<<',
        'alias ll="ls -la"',
        '',
      ].join('\n');

      const next = upsertManagedBlock(
        before,
        "export AI_GATEWAY_API_KEY='new'"
      );

      // Exactly one managed block, updated in place — never duplicated.
      expect(next.match(/>>> vercel ai-gateway >>>/g)).toHaveLength(1);
      expect(next).toContain("export AI_GATEWAY_API_KEY='new'");
      expect(next).not.toContain("export AI_GATEWAY_API_KEY='old'");
      // The user's own lines are untouched.
      expect(next).toContain('export PATH="$PATH:/usr/local/bin"');
      expect(next).toContain('alias ll="ls -la"');
    });

    it('appends a managed block when the rc has none', () => {
      const next = upsertManagedBlock('# just my rc\n', 'export X=1');
      expect(next).toContain('# just my rc');
      expect(next.match(/>>> vercel ai-gateway >>>/g)).toHaveLength(1);
    });

    it('separates the appended block from existing content with a blank line', () => {
      const block = [
        '# >>> vercel ai-gateway >>>',
        'export X=1',
        '# <<< vercel ai-gateway <<<',
        '',
      ].join('\n');

      // A newline-terminated rc gains exactly one blank separator line.
      expect(upsertManagedBlock('alias ll="ls -la"\n', 'export X=1')).toBe(
        `alias ll="ls -la"\n\n${block}`
      );
      // No trailing newline: terminate the last line, then the blank line.
      expect(upsertManagedBlock('alias ll="ls -la"', 'export X=1')).toBe(
        `alias ll="ls -la"\n\n${block}`
      );
      // Already blank-line-terminated: nothing extra is added.
      expect(upsertManagedBlock('alias ll="ls -la"\n\n', 'export X=1')).toBe(
        `alias ll="ls -la"\n\n${block}`
      );
      // An empty rc starts with the block — no leading blank line.
      expect(upsertManagedBlock('', 'export X=1')).toBe(block);
      expect(upsertManagedBlock(null, 'export X=1')).toBe(block);
    });
  });

  describe('detectShellRc', () => {
    const realPlatform = process.platform;
    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: realPlatform,
        configurable: true,
      });
      delete process.env.ZDOTDIR;
    });

    it('uses .bash_profile for bash on macOS and .bashrc elsewhere', () => {
      process.env.SHELL = '/bin/bash';
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
      expect(detectShellRc(home)).toBe(join(home, '.bash_profile'));
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(detectShellRc(home)).toBe(join(home, '.bashrc'));
    });

    it('relocates the zsh rc to $ZDOTDIR when set', () => {
      process.env.SHELL = '/bin/zsh';
      process.env.ZDOTDIR = join(home, 'zdot');
      expect(detectShellRc(home)).toBe(join(home, 'zdot', '.zshrc'));
    });

    it('honors an explicit override above everything else', () => {
      process.env.SHELL = '/bin/bash';
      const custom = join(home, 'custom', 'rc');
      expect(detectShellRc(home, custom)).toBe(custom);
    });
  });
});
