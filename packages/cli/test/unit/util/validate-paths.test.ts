import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import validatePaths, {
  validateRootDirectory,
} from '../../../src/util/validate-paths';
import type Client from '../../../src/util/client';
import output from '../../../src/output-manager';
import { outputActionRequired } from '../../../src/util/agent-output';

vi.mock('../../../src/output-manager', () => ({
  default: {
    initialize: vi.fn(),
    error: vi.fn(),
    print: vi.fn(),
  },
}));

vi.mock('../../../src/util/agent-output', () => ({
  outputActionRequired: vi.fn(),
}));

describe('validatePaths home-directory confirmation', () => {
  let client: Client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = {
      nonInteractive: false,
      stdin: { isTTY: true },
      input: { confirm: vi.fn().mockResolvedValue(false) },
      argv: ['node', 'vercel', 'deploy'],
    } as unknown as Client;
  });

  it.each([
    { nonInteractive: true, isTTY: true },
    { nonInteractive: true, isTTY: false },
    { nonInteractive: false, isTTY: false },
    { nonInteractive: false, isTTY: undefined },
  ])('refuses without prompting for %j', async ({ nonInteractive, isTTY }) => {
    client.nonInteractive = nonInteractive;
    Object.defineProperty(client.stdin, 'isTTY', { value: isTTY });

    await expect(validatePaths(client, [homedir()])).resolves.toEqual({
      valid: false,
      exitCode: 2,
    });

    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(outputActionRequired).toHaveBeenCalledWith(
      client,
      {
        status: 'action_required',
        reason: 'interactive_confirmation_required',
        message: expect.stringContaining('Run from your project directory'),
        userActionRequired: true,
      },
      2
    );
    expect(output.error).toHaveBeenCalledWith(
      expect.stringContaining("Can't deploy your home directory")
    );
    expect(output.print).not.toHaveBeenCalled();
  });

  it.each([
    '--yes',
    '-y',
    '--force',
    '--confirm',
  ])('does not treat %s as consent to deploy the home directory', async flag => {
    client.nonInteractive = true;
    client.argv.push(flag);

    await expect(validatePaths(client, [homedir()])).resolves.toEqual({
      valid: false,
      exitCode: 2,
    });
    expect(client.input.confirm).not.toHaveBeenCalled();
  });

  it('preserves the interactive prompt and defaults to no', async () => {
    await expect(validatePaths(client, [homedir()])).resolves.toEqual({
      valid: false,
      exitCode: 0,
    });
    expect(client.input.confirm).toHaveBeenCalledWith(
      'You are deploying your home directory. Do you want to continue?',
      false
    );
    expect(output.print).toHaveBeenCalledWith('Canceled\n');
    expect(outputActionRequired).not.toHaveBeenCalled();
  });

  it('accepts an interactive confirmation', async () => {
    vi.mocked(client.input.confirm).mockResolvedValue(true);

    await expect(validatePaths(client, [homedir()])).resolves.toEqual({
      valid: true,
      path: homedir(),
      isFile: false,
    });
    expect(output.error).not.toHaveBeenCalled();
    expect(outputActionRequired).not.toHaveBeenCalled();
  });

  it('does not require confirmation for another directory in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.stdin.isTTY = false;
    const directory = mkdtempSync(join(tmpdir(), 'vc-deploy-'));
    try {
      await expect(validatePaths(client, [directory])).resolves.toEqual({
        valid: true,
        path: directory,
        isFile: false,
      });
      expect(client.input.confirm).not.toHaveBeenCalled();
      expect(outputActionRequired).not.toHaveBeenCalled();
      expect(output.error).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('validateRootDirectory', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'vc-root-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
    // The sibling-prefix dir lives next to `base`, not inside it.
    rmSync(`${base}-evil`, { recursive: true, force: true });
  });

  it('accepts the project root itself', async () => {
    expect(await validateRootDirectory(base, base)).toBe(true);
  });

  it('accepts a directory inside the project root', async () => {
    const sub = join(base, 'apps', 'web');
    mkdirSync(sub, { recursive: true });
    expect(await validateRootDirectory(base, sub)).toBe(true);
  });

  it('rejects a sibling directory that shares the root as a string prefix', async () => {
    // A raw `startsWith(cwd)` would wrongly accept this.
    const sibling = `${base}-evil`;
    mkdirSync(sibling, { recursive: true });
    expect(await validateRootDirectory(base, sibling)).toBe(false);
  });

  it('rejects a path that escapes the root via ..', async () => {
    const outside = join(base, '..');
    expect(await validateRootDirectory(base, outside)).toBe(false);
  });
});
