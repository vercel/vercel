import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureDirSync } from 'fs-extra';
import {
  getAuthConfigFilePath,
  getConfigFilePath,
  getDefaultAuthConfig,
  readGlobalConfigFile,
  writeGlobalConfigFile,
} from '@vercel/cli-config';
import {
  persistCliAuthConfig,
  readCliAuthConfig,
} from '@vercel/cli-auth/credentials-store.js';
import {
  defaultCliConfigStore,
  exitOnFatalGlobalConfigWriteError,
  liveCliConfigStore,
  writeGlobalConfigOrThrow,
} from '../../src/gateways/cli-config-store';
import output from '../../src/output-manager';
import * as configFiles from '../../src/util/config/files';

// No filesystem, keyring, or process exit: every collaborator is mocked.
vi.mock('fs-extra', () => ({ ensureDirSync: vi.fn() }));
vi.mock('@vercel/cli-config', () => ({
  getAuthConfigFilePath: vi.fn(),
  getConfigFilePath: vi.fn(),
  getDefaultAuthConfig: vi.fn(),
  readGlobalConfigFile: vi.fn(),
  writeGlobalConfigFile: vi.fn(),
}));
vi.mock('@vercel/cli-auth/credentials-store.js', () => ({
  persistCliAuthConfig: vi.fn(),
  readCliAuthConfig: vi.fn(),
}));
vi.mock('../../src/util/config/files', () => ({
  getGlobalConfigDir: vi.fn(),
  readConfigFile: vi.fn(),
  writeToConfigFile: vi.fn(),
  readAuthConfigFile: vi.fn(),
  persistAuthConfig: vi.fn(),
}));

const globalDir = join('/global', 'vercel');
const configFilePath = join(globalDir, 'config.json');
const authConfigFilePath = join(globalDir, 'auth.json');
const defaults = { '// Note': 'defaults' };

const errno = (code: string, message = code) =>
  Object.assign(new Error(message), { code });
/** An errno-shaped error whose `code` is empty. */
const emptyCode = () => errno('', 'empty code');

function throwing(err: unknown) {
  return () => {
    throw err;
  };
}

beforeEach(() => {
  vi.mocked(ensureDirSync).mockReset();
  vi.mocked(getConfigFilePath).mockReset().mockReturnValue(configFilePath);
  vi.mocked(getAuthConfigFilePath)
    .mockReset()
    .mockReturnValue(authConfigFilePath);
  vi.mocked(getDefaultAuthConfig).mockReset().mockReturnValue(defaults);
  vi.mocked(readGlobalConfigFile).mockReset();
  vi.mocked(writeGlobalConfigFile).mockReset();
  vi.mocked(persistCliAuthConfig).mockReset();
  vi.mocked(readCliAuthConfig).mockReset();
  vi.mocked(configFiles.getGlobalConfigDir)
    .mockReset()
    .mockReturnValue(globalDir);
  vi.mocked(configFiles.readConfigFile).mockReset();
  vi.mocked(configFiles.writeToConfigFile).mockReset();
  vi.mocked(configFiles.readAuthConfigFile).mockReset();
  vi.mocked(configFiles.persistAuthConfig).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('liveCliConfigStore (mocked config files)', () => {
  const store = () => liveCliConfigStore({ globalDir });

  it('resolves file paths from the global directory', () => {
    expect(store().globalDir).toBe(globalDir);
    expect(getConfigFilePath).toHaveBeenCalledWith(globalDir);
    expect(getAuthConfigFilePath).toHaveBeenCalledWith(globalDir);
  });

  describe('ensureGlobalDir', () => {
    it('creates the directory', () => {
      expect(store().ensureGlobalDir()).toEqual({ ok: true });
      expect(ensureDirSync).toHaveBeenCalledWith(globalDir);
    });

    it('maps failures to mkdir_failed', () => {
      const cause = errno('EACCES');
      vi.mocked(ensureDirSync).mockImplementation(throwing(cause));

      expect(store().ensureGlobalDir()).toEqual({
        ok: false,
        error: { code: 'mkdir_failed', message: 'EACCES', details: { cause } },
      });
    });
  });

  describe('readGlobalConfig', () => {
    it('reads config.json', () => {
      vi.mocked(readGlobalConfigFile).mockReturnValue({ currentTeam: 't' });

      expect(store().readGlobalConfig()).toEqual({
        type: 'found',
        value: { currentTeam: 't' },
      });
      expect(readGlobalConfigFile).toHaveBeenCalledWith(configFilePath);
    });

    it.each([
      ['ENOENT', errno('ENOENT'), undefined],
      ['a coded error', errno('EACCES'), 'EACCES'],
      ['an empty code', emptyCode(), 'read_failed'],
      ['an uncoded error', new SyntaxError('bad json'), 'read_failed'],
    ])('maps %s', (_name, cause, code) => {
      vi.mocked(readGlobalConfigFile).mockImplementation(throwing(cause));

      expect(store().readGlobalConfig()).toEqual(
        code
          ? {
              type: 'error',
              error: { code, message: cause.message, details: { cause } },
            }
          : { type: 'missing' }
      );
    });
  });

  describe('writeGlobalConfig', () => {
    it('writes config.json', () => {
      const config = { currentTeam: 't' };

      expect(store().writeGlobalConfig({ config })).toEqual({ ok: true });
      expect(writeGlobalConfigFile).toHaveBeenCalledWith(
        configFilePath,
        config
      );
    });

    it.each([
      ['EPERM', errno('EPERM'), 'EPERM'],
      ['EBADF', errno('EBADF'), 'EBADF'],
      ['other errno codes', errno('ENOSPC'), 'write_failed'],
      ['an uncoded error', new Error('boom'), 'write_failed'],
    ])('maps %s', (_name, cause, code) => {
      vi.mocked(writeGlobalConfigFile).mockImplementation(throwing(cause));

      expect(store().writeGlobalConfig({ config: {} })).toEqual({
        ok: false,
        error: { code, message: cause.message, details: { cause } },
      });
    });
  });

  describe('readAuthConfig', () => {
    it('merges credentials over the default auth config', () => {
      vi.mocked(readCliAuthConfig).mockReturnValue({ token: 'tok_1' });

      expect(store().readAuthConfig()).toEqual({
        type: 'found',
        value: { ...defaults, token: 'tok_1' },
      });
      expect(readCliAuthConfig).toHaveBeenCalledWith(globalDir);
    });

    it.each([
      ['ENOENT', errno('ENOENT'), undefined],
      ['a coded error', errno('EACCES'), 'EACCES'],
      ['an uncoded error', new Error('keyring locked'), 'read_failed'],
    ])('maps %s', (_name, cause, code) => {
      vi.mocked(readCliAuthConfig).mockImplementation(throwing(cause));

      expect(store().readAuthConfig()).toEqual(
        code
          ? {
              type: 'error',
              error: { code, message: cause.message, details: { cause } },
            }
          : { type: 'missing' }
      );
    });
  });

  describe('persistAuthConfig', () => {
    it('persists credentials in the global directory', () => {
      const authConfig = { token: 'tok_1' };

      expect(store().persistAuthConfig({ authConfig })).toEqual({ ok: true });
      expect(persistCliAuthConfig).toHaveBeenCalledWith(globalDir, authConfig);
    });

    it('wraps failures with the legacy message', () => {
      const cause = errno('EACCES', 'permission denied');
      vi.mocked(persistCliAuthConfig).mockImplementation(throwing(cause));

      expect(
        store().persistAuthConfig({ authConfig: { token: 'tok_1' } })
      ).toEqual({
        ok: false,
        error: {
          code: 'persist_failed',
          message: `Not able to create ${authConfigFilePath} (permission denied).`,
          details: { cause },
        },
      });
    });
  });
});

describe('defaultCliConfigStore (mocked config files)', () => {
  const store = () => defaultCliConfigStore();

  it('reads the global directory lazily', () => {
    const s = store();
    vi.mocked(configFiles.getGlobalConfigDir).mockReturnValue('/other');

    expect(s.globalDir).toBe('/other');
  });

  describe('ensureGlobalDir', () => {
    it('creates the directory', () => {
      expect(store().ensureGlobalDir()).toEqual({ ok: true });
      expect(ensureDirSync).toHaveBeenCalledWith(globalDir);
    });

    it('maps failures to mkdir_failed', () => {
      const cause = errno('EACCES');
      vi.mocked(ensureDirSync).mockImplementation(throwing(cause));

      expect(store().ensureGlobalDir()).toMatchObject({
        ok: false,
        error: { code: 'mkdir_failed', details: { cause } },
      });
    });
  });

  describe('readGlobalConfig', () => {
    it('reads through readConfigFile', () => {
      vi.mocked(configFiles.readConfigFile).mockReturnValue({
        currentTeam: 't',
      });

      expect(store().readGlobalConfig()).toEqual({
        type: 'found',
        value: { currentTeam: 't' },
      });
    });

    it.each([
      ['ENOENT', errno('ENOENT'), undefined],
      ['a coded error', errno('EACCES'), 'EACCES'],
      ['an uncoded error', new SyntaxError('bad json'), 'read_failed'],
    ])('maps %s', (_name, cause, code) => {
      vi.mocked(configFiles.readConfigFile).mockImplementation(throwing(cause));

      expect(store().readGlobalConfig()).toEqual(
        code
          ? {
              type: 'error',
              error: { code, message: cause.message, details: { cause } },
            }
          : { type: 'missing' }
      );
    });
  });

  describe('writeGlobalConfig', () => {
    it('writes through writeToConfigFile', () => {
      const config = { currentTeam: 't' };

      expect(store().writeGlobalConfig({ config })).toEqual({ ok: true });
      expect(configFiles.writeToConfigFile).toHaveBeenCalledWith(config);
    });

    it.each([
      ['EPERM', errno('EPERM'), 'EPERM'],
      ['other failures', new Error('boom'), 'write_failed'],
    ])('maps %s', (_name, cause, code) => {
      vi.mocked(configFiles.writeToConfigFile).mockImplementation(
        throwing(cause)
      );

      expect(store().writeGlobalConfig({ config: {} })).toEqual({
        ok: false,
        error: { code, message: cause.message, details: { cause } },
      });
    });
  });

  describe('readAuthConfig', () => {
    it('reads through readAuthConfigFile', () => {
      vi.mocked(configFiles.readAuthConfigFile).mockReturnValue({
        token: 'tok_1',
      });

      expect(store().readAuthConfig()).toEqual({
        type: 'found',
        value: { token: 'tok_1' },
      });
      expect(configFiles.readAuthConfigFile).toHaveBeenCalledWith({});
    });

    it.each([
      ['ENOENT', errno('ENOENT'), undefined],
      ['a coded error', errno('EACCES'), 'EACCES'],
      ['an uncoded error', new Error('keyring locked'), 'read_failed'],
    ])('maps %s', (_name, cause, code) => {
      vi.mocked(configFiles.readAuthConfigFile).mockImplementation(
        throwing(cause)
      );

      expect(store().readAuthConfig()).toEqual(
        code
          ? {
              type: 'error',
              error: { code, message: cause.message, details: { cause } },
            }
          : { type: 'missing' }
      );
    });
  });

  describe('persistAuthConfig', () => {
    it('persists through persistAuthConfig', () => {
      const authConfig = { token: 'tok_1' };

      expect(store().persistAuthConfig({ authConfig })).toEqual({ ok: true });
      expect(configFiles.persistAuthConfig).toHaveBeenCalledWith(
        authConfig,
        {}
      );
    });

    it('keeps the wrapped message and exposes the inner cause', () => {
      const inner = errno('EACCES');
      const wrapped = new Error('Not able to create auth.json (EACCES).', {
        cause: inner,
      });
      vi.mocked(configFiles.persistAuthConfig).mockImplementation(
        throwing(wrapped)
      );

      expect(store().persistAuthConfig({ authConfig: {} })).toEqual({
        ok: false,
        error: {
          code: 'persist_failed',
          message: 'Not able to create auth.json (EACCES).',
          details: { cause: inner },
        },
      });
    });

    it('stringifies a non-Error failure', () => {
      vi.mocked(configFiles.persistAuthConfig).mockImplementation(
        throwing('disk full')
      );

      expect(store().persistAuthConfig({ authConfig: {} })).toEqual({
        ok: false,
        error: {
          code: 'persist_failed',
          message: 'disk full',
          details: { cause: 'disk full' },
        },
      });
    });
  });
});

describe('exitOnFatalGlobalConfigWriteError', () => {
  const store = () => liveCliConfigStore({ globalDir });

  it.each([
    ['EPERM', 'operation not permitted'],
    ['EBADF', 'bad file descriptor'],
  ])('prints and exits on %s', (code, reason) => {
    const error = vi.spyOn(output, 'error').mockImplementation(() => {});
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    exitOnFatalGlobalConfigWriteError(store(), { code, message: code });

    expect(error).toHaveBeenCalledWith(expect.stringContaining(`(${reason}).`));
    expect(error.mock.calls[0][0]).toContain(configFilePath);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('returns for other failures', () => {
    const error = vi.spyOn(output, 'error').mockImplementation(() => {});
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    exitOnFatalGlobalConfigWriteError(store(), {
      code: 'write_failed',
      message: 'boom',
    });

    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe('writeGlobalConfigOrThrow', () => {
  it('writes the config', () => {
    const config = { currentTeam: 't' };

    writeGlobalConfigOrThrow(liveCliConfigStore({ globalDir }), config);

    expect(writeGlobalConfigFile).toHaveBeenCalledWith(configFilePath, config);
  });

  it('exits on EPERM', () => {
    vi.spyOn(output, 'error').mockImplementation(() => {});
    const exited = new Error('process.exit');
    const exit = vi.spyOn(process, 'exit').mockImplementation(throwing(exited));
    vi.mocked(writeGlobalConfigFile).mockImplementation(
      throwing(errno('EPERM'))
    );

    expect(() =>
      writeGlobalConfigOrThrow(liveCliConfigStore({ globalDir }), {})
    ).toThrow(exited);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('rethrows the original error for other failures', () => {
    const cause = new Error('boom');
    vi.mocked(writeGlobalConfigFile).mockImplementation(throwing(cause));

    expect(() =>
      writeGlobalConfigOrThrow(liveCliConfigStore({ globalDir }), {})
    ).toThrow(cause);
  });
});
