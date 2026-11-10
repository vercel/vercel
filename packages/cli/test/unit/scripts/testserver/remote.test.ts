import { describe, expect, test } from 'vitest';
import {
  lineSplitter,
  outputRule,
  rewriteRemotePaths,
  stagingDir,
  stagingPath,
} from '../../../../scripts/testserver/remote.mjs';

interface Call {
  cmd: string;
  args: string[];
}

/** A sandbox whose `mktemp` prints a staging dir, or fails `mktempFails` times. */
function fakeSandbox(mktempFails = 0) {
  const calls: Call[] = [];
  const written: string[] = [];
  let made = 0;
  return {
    calls,
    written,
    async writeFiles(files: { path: string }[]) {
      written.push(...files.map(f => f.path));
    },
    async runCommand({ cmd, args }: Call) {
      calls.push({ cmd, args });
      const failed = cmd === 'mktemp' && mktempFails-- > 0;
      const stdout = cmd === 'mktemp' ? `/tmp/testserver.${++made}\n` : '';
      return {
        exitCode: failed ? 1 : 0,
        stdout: async () => stdout,
        output: async () => (failed ? 'mktemp: no space' : ''),
      };
    },
  };
}

describe('stagingDir()', () => {
  test("makes one directory per sandbox with the sandbox's mktemp", async () => {
    const sandbox = fakeSandbox();
    const [a, b] = await Promise.all([
      stagingDir(sandbox),
      stagingPath(sandbox, 'x.tgz'),
    ]);
    expect(a).toBe('/tmp/testserver.1');
    expect(b).toBe('/tmp/testserver.1/x.tgz');
    expect(sandbox.calls).toEqual([
      { cmd: 'mktemp', args: ['-d', '-t', 'testserver.XXXXXXXX'] },
    ]);
    expect(await stagingDir(fakeSandbox())).toBe('/tmp/testserver.1');
  });

  test('retries after a failed mktemp', async () => {
    const sandbox = fakeSandbox(1);
    await expect(stagingDir(sandbox)).rejects.toMatchObject({
      name: 'RunnerError',
      message: expect.stringContaining('mktemp: no space'),
    });
    expect(await stagingDir(sandbox)).toBe('/tmp/testserver.2');
    expect(sandbox.calls.map(c => c.cmd)).toEqual(['mktemp', 'mktemp']);
  });
});

describe('rewriteRemotePaths()', () => {
  test('maps runner paths to local ones', () => {
    expect(
      rewriteRemotePaths(
        'artifacts=/vercel/sandbox/packages/cli/test/testserver/.results/x\n at /vercel/sandbox/packages/cli/a.ts:1',
        '/vercel/sandbox',
        '/Users/me/repo'
      )
    ).toBe(
      'artifacts=/Users/me/repo/packages/cli/test/testserver/.results/x\n at /Users/me/repo/packages/cli/a.ts:1'
    );
  });

  test('leaves other paths alone', () => {
    expect(
      rewriteRemotePaths('/vercel/sandboxes /tmp/x', '/vercel/sandbox', '/r')
    ).toBe('/vercel/sandboxes /tmp/x');
  });
});

describe('lineSplitter()', () => {
  test('holds partial lines until they end', () => {
    const lines = lineSplitter();
    expect(lines.push('one\ntw')).toBe('one\n');
    expect(lines.push('o\nthr')).toBe('two\n');
    expect(lines.push('ee')).toBe('');
    expect(lines.flush()).toBe('three');
    expect(lines.flush()).toBe('');
  });
});

describe('outputRule()', () => {
  test('pads the text to the width with a rule', () => {
    const rule = outputRule('Vitest output', 30);
    expect(rule).toBe('── Vitest output ─────────────');
    expect(rule).toHaveLength(30);
  });

  test('keeps a short tail when the text is wider than the width', () => {
    expect(outputRule('a long label', 5)).toBe('── a long label ──');
  });
});
