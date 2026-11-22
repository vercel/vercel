import { describe, expect, it } from 'vitest';
import { Diagnostic } from 'nostics';
import { NowBuildError } from '@vercel/build-utils';
import {
  dev,
  toDiagnostic,
  telemetryCodes,
  ServiceStartError,
} from '../../../../src/util/dev/diagnostics';
import {
  CantParseJSONFile,
  ConflictingConfigFiles,
  LambdaSizeExceededError,
  MissingDotenvVarsError,
} from '../../../../src/util/errors-ts';

describe('dev diagnostics catalog', () => {
  it('builds a Diagnostic with code (name), message (why) and fix', () => {
    const d = dev.DEV_CWD_NOT_FOUND({ cwd: '/nope' });
    expect(d).toBeInstanceOf(Error);
    expect(d).toBeInstanceOf(Diagnostic);
    expect(d.name).toEqual('DEV_CWD_NOT_FOUND');
    expect(d.message).toEqual('Directory `/nope` does not exist');
    expect(d.fix).toBeTruthy();
  });

  it('reproduces the original message text exactly (no regression)', () => {
    expect(dev.DEV_INVALID_LISTEN_SCHEME({ protocol: 'ftp:' }).message).toEqual(
      'Unknown `--listen` scheme (protocol): ftp:'
    );
    expect(
      dev.DEV_PORT_DETECTION_TIMED_OUT({ port: 3000, timeout: 5000 }).message
    ).toEqual('Detecting port 3000 timed out after 5s');
  });

  it('DEV_RECURSIVE_INVOCATION carries a code, fix, and a real docs URL', () => {
    const d = dev.DEV_RECURSIVE_INVOCATION();
    expect(d.name).toEqual('DEV_RECURSIVE_INVOCATION');
    expect(d.message).toContain('must not recursively invoke itself');
    expect(d.fix).toBeTruthy();
    expect(d.docs).toEqual(
      'https://vercel.link/recursive-invocation-of-commands'
    );
  });

  it('DEV_LOCK_HELD uses the caller-supplied detail as its fix', () => {
    const d = dev.DEV_LOCK_HELD({ detail: 'Stop it by running `kill 123`.' });
    expect(d.name).toEqual('DEV_LOCK_HELD');
    expect(d.message).toContain('already running');
    expect(d.fix).toEqual('Stop it by running `kill 123`.');
  });

  it('DEV_LISTEN_ADDRESS_IN_USE interpolates the address without ANSI', () => {
    const d = dev.DEV_LISTEN_ADDRESS_IN_USE({ address: 'unix:/tmp/app.sock' });
    expect(d.name).toEqual('DEV_LISTEN_ADDRESS_IN_USE');
    expect(d.message).toEqual(
      'Requested socket unix:/tmp/app.sock is already in use'
    );
    expect(d.fix).toBeTruthy();
  });

  it('DEV_UNSUPPORTED_CONFIG_VERSION preserves the original message', () => {
    const d = dev.DEV_UNSUPPORTED_CONFIG_VERSION();
    expect(d.name).toEqual('DEV_UNSUPPORTED_CONFIG_VERSION');
    expect(d.message).toEqual('Cannot run `version: 1` projects');
    expect(d.fix).toBeTruthy();
  });
});

describe('toDiagnostic', () => {
  it('returns an existing Diagnostic unchanged (no double-wrap)', () => {
    const d = dev.DEV_CWD_NOT_FOUND({ cwd: '/x' });
    expect(toDiagnostic(d)).toBe(d);
  });

  it('wraps a NowBuildError: code -> name, link -> docs, action preserved, curated fix attached', () => {
    const err = new NowBuildError({
      code: 'MISSING_DOTENV_VARS',
      message: 'Env var "FOO" is not defined',
      link: 'https://example.com/docs',
      action: 'View Documentation',
    });
    const d = toDiagnostic(err);
    expect(d).toBeInstanceOf(Diagnostic);
    expect(d.name).toEqual('MISSING_DOTENV_VARS');
    expect(d.message).toEqual('Env var "FOO" is not defined');
    expect(d.docs).toEqual('https://example.com/docs');
    expect(d.fix).toContain('.env');
    expect((d as Diagnostic & { action?: string }).action).toEqual(
      'View Documentation'
    );
    expect(d.cause).toBe(err);
  });

  it('wraps a plain {code, message} object (e.g. detectBuilders) without "[object Object]"', () => {
    const d = toDiagnostic({
      code: 'missing_build_script',
      message: 'Your `package.json` is missing a `build` script.',
    });
    expect(d.name).toEqual('missing_build_script');
    expect(d.message).toEqual(
      'Your `package.json` is missing a `build` script.'
    );
    expect(d.fix).toBeTruthy();
  });

  it('wraps a generic Error: message preserved, no code, no fix', () => {
    const err = new Error('boom');
    const d = toDiagnostic(err);
    expect(d.message).toEqual('boom');
    expect(d.name).toEqual('Diagnostic');
    expect(d.fix).toBeUndefined();
    expect(d.cause).toBe(err);
  });

  it('leaves fix undefined for an unknown code', () => {
    const d = toDiagnostic({ code: 'SOME_UNKNOWN_CODE', message: 'x' });
    expect(d.name).toEqual('SOME_UNKNOWN_CODE');
    expect(d.fix).toBeUndefined();
  });

  it('buckets OS syscall codes (ENOENT) under one code, not the raw code', () => {
    const err = Object.assign(new Error('spawn foo ENOENT'), {
      code: 'ENOENT',
      errno: -2,
      syscall: 'spawn foo',
    });
    const d = toDiagnostic(err);
    // The raw syscall code is collapsed into a single stable code, but the original
    // message is preserved and the diagnostic carries a fix and the cause.
    expect(d.name).toEqual('DEV_SYSCALL_ERROR');
    expect(d.message).toEqual('spawn foo ENOENT');
    expect(d.fix).toBeTruthy();
    expect(d.cause).toBe(err);
  });

  it('promotes a product code even when it looks errno-shaped', () => {
    // No `errno`/`syscall`, so it is a real diagnostic code, not a syscall error.
    const err = Object.assign(new Error('token expired'), { code: 'EXPIRED' });
    const d = toDiagnostic(err);
    expect(d.name).toEqual('EXPIRED');
  });

  it('attaches the curated fix for a CantParseJSONFile-shaped error', () => {
    const d = toDiagnostic({
      code: 'CANT_PARSE_JSON_FILE',
      message: "Can't parse json file /app/package.json: Unexpected token",
    });
    expect(d.name).toEqual('CANT_PARSE_JSON_FILE');
    expect(d.fix).toContain('JSON syntax');
  });
});

describe('FIX_BY_CODE drift guard', () => {
  it.each([
    ['CANT_PARSE_JSON_FILE', new CantParseJSONFile('/x/package.json', 'pos 2')],
    ['CONFLICTING_CONFIG_FILES', new ConflictingConfigFiles(['vercel.json'])],
    ['MAX_LAMBDA_SIZE_EXCEEDED', new LambdaSizeExceededError(100, 50)],
    ['MISSING_DOTENV_VARS', new MissingDotenvVarsError('.env', ['FOO'])],
  ])('keeps a fix for %s', (expectedCode, err) => {
    const d = toDiagnostic(err);
    expect(d.name).toEqual(expectedCode);
    expect(d.fix).toBeTruthy();
  });
});

describe('ServiceStartError', () => {
  it('surfaces each distinct child code’s curated fix', () => {
    const err = new ServiceStartError([
      new NowBuildError({
        code: 'INSTALL_COMMAND_FAILED',
        message: 'api: install failed',
      }),
      new NowBuildError({
        code: 'NODE_DEPENDENCY_SYNC_FAILED',
        message: 'web: dependencies out of sync',
      }),
    ]);
    expect(err.name).toEqual('DEV_SERVICE_START_FAILED');
    expect(err.message).toContain('api: install failed');
    expect(err.message).toContain('web: dependencies out of sync');
    // both curated fixes surfaced (not the generic aggregate hint)
    expect(err.fix).toContain('Fix the dependency error logged above');
    expect(err.fix).toContain('Install your dependencies');
  });

  it('falls back to the generic aggregate fix when no child code has one', () => {
    const err = new ServiceStartError([new Error('service X died')]);
    expect(err.message).toContain('service X died');
    expect(err.fix).toContain('Review the per-service errors above');
  });

  it('dedupes repeated PYTHON_EXTERNAL_VENV_DETECTED messages', () => {
    const message = 'External virtualenv detected';
    const err = new ServiceStartError([
      new NowBuildError({ code: 'PYTHON_EXTERNAL_VENV_DETECTED', message }),
      new NowBuildError({ code: 'PYTHON_EXTERNAL_VENV_DETECTED', message }),
    ]);
    expect(err.message).toEqual(message);
  });

  it('records distinct child codes in first-seen order', () => {
    const err = new ServiceStartError([
      new NowBuildError({
        code: 'INVALID_PYPROJECT_TOML',
        message: 'bad toml',
      }),
      new NowBuildError({ code: 'INSTALL_COMMAND_FAILED', message: 'install' }),
      new NowBuildError({ code: 'INVALID_PYPROJECT_TOML', message: 'again' }),
    ]);
    expect(err.childCodes).toEqual([
      'INVALID_PYPROJECT_TOML',
      'INSTALL_COMMAND_FAILED',
    ]);
  });
});

describe('telemetryCodes', () => {
  it('returns the diagnostic name for a normal diagnostic', () => {
    expect(telemetryCodes(dev.DEV_CWD_NOT_FOUND({ cwd: '/x' }))).toEqual([
      'DEV_CWD_NOT_FOUND',
    ]);
  });

  it('returns the single child code of a ServiceStartError', () => {
    const err = new ServiceStartError([
      new NowBuildError({
        code: 'INVALID_PYPROJECT_TOML',
        message: 'bad pyproject.toml',
      }),
    ]);
    expect(err.name).toEqual('DEV_SERVICE_START_FAILED');
    expect(telemetryCodes(err)).toEqual(['INVALID_PYPROJECT_TOML']);
  });

  it('returns every distinct child code when several exist', () => {
    const err = new ServiceStartError([
      new NowBuildError({ code: 'INVALID_PYPROJECT_TOML', message: 'a' }),
      new NowBuildError({ code: 'INSTALL_COMMAND_FAILED', message: 'b' }),
      new NowBuildError({ code: 'INVALID_PYPROJECT_TOML', message: 'dupe' }),
    ]);
    expect(telemetryCodes(err)).toEqual([
      'INVALID_PYPROJECT_TOML',
      'INSTALL_COMMAND_FAILED',
    ]);
  });

  it('falls back to the aggregate name when no child carries a code', () => {
    const err = new ServiceStartError([new Error('service died')]);
    expect(telemetryCodes(err)).toEqual(['DEV_SERVICE_START_FAILED']);
  });
});
