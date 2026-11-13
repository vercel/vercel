import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openCommand } from '../../../../src/commands/agent/browser';
import { looksLikeProject } from '../../../../src/commands/agent/link';

const tmp = (): string => mkdtempSync(join(tmpdir(), 'vercel-agent-link-'));

describe('looksLikeProject', () => {
  it('accepts a package.json or any parent git repo', () => {
    const pkg = tmp();
    writeFileSync(join(pkg, 'package.json'), '{}');
    expect(looksLikeProject(pkg)).toBe(true);

    const repo = tmp();
    mkdirSync(join(repo, '.git'));
    mkdirSync(join(repo, 'a/b'), { recursive: true });
    expect(looksLikeProject(join(repo, 'a/b'))).toBe(true);

    expect(looksLikeProject(tmp())).toBe(false);
  });
});

describe('openCommand', () => {
  it('uses the platform opener', () => {
    expect(openCommand('https://x', 'darwin')).toEqual(['open', ['https://x']]);
    expect(openCommand('https://x', 'linux')).toEqual([
      'xdg-open',
      ['https://x'],
    ]);
    expect(openCommand('https://x', 'win32')).toEqual([
      'cmd',
      ['/c', 'start', '', 'https://x'],
    ]);
  });
});
