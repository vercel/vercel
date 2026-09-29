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
import { errorToStringFriendly, isErrnoException } from '@vercel/error-utils';
import type { AuthConfig, GlobalConfig } from '@vercel-internals/types';
import * as configFiles from '../util/config/files';
import hp from '../util/humanize-path';
import highlight from '../util/output/highlight';
import output from '../output-manager';
import {
  gatewayErrorCause,
  gatewayErrorFromCause,
  type GatewayErrorInfo,
  type OperationResult,
  type OptionalResult,
} from './result';

/**
 * The global CLI config directory: `config.json` and auth credentials.
 * Synchronous, like the underlying file helpers.
 */
export type CliConfigStore = {
  /** Resolved global config directory, for messages and telemetry paths. */
  readonly globalDir: string;
  ensureGlobalDir(): OperationResult;
  /** `missing` means the config file does not exist (ENOENT). */
  readGlobalConfig(): OptionalResult<GlobalConfig>;
  /** Error codes: `EPERM`, `EBADF`, or `write_failed`. */
  writeGlobalConfig(input: { config: GlobalConfig }): OperationResult;
  /** A found value is already merged with `getDefaultAuthConfig()`. */
  readAuthConfig(): OptionalResult<AuthConfig>;
  /** The error message is the wrapped `Not able to create …` text. */
  persistAuthConfig(input: { authConfig: AuthConfig }): OperationResult;
};

function isEnoent(err: unknown): boolean {
  return isErrnoException(err) && err.code === 'ENOENT';
}

function writeErrorCode(err: unknown): string {
  if (isErrnoException(err) && (err.code === 'EPERM' || err.code === 'EBADF')) {
    return err.code;
  }
  return 'write_failed';
}

function readErrorCode(err: unknown): string {
  return isErrnoException(err) && err.code ? err.code : 'read_failed';
}

/**
 * Live store over a resolved global config directory. Never calls
 * `process.exit`; callers decide how to handle write failures.
 */
export function liveCliConfigStore({
  globalDir,
}: {
  globalDir: string;
}): CliConfigStore {
  const configFilePath = getConfigFilePath(globalDir);
  const authConfigFilePath = getAuthConfigFilePath(globalDir);

  return {
    globalDir,
    ensureGlobalDir() {
      try {
        ensureDirSync(globalDir);
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: gatewayErrorFromCause('mkdir_failed', err) };
      }
    },
    readGlobalConfig() {
      try {
        return { type: 'found', value: readGlobalConfigFile(configFilePath) };
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return { type: 'missing' };
        }
        return {
          type: 'error',
          error: gatewayErrorFromCause(readErrorCode(err), err),
        };
      }
    },
    writeGlobalConfig({ config }) {
      try {
        writeGlobalConfigFile(configFilePath, config);
        return { ok: true };
      } catch (err: unknown) {
        return {
          ok: false,
          error: gatewayErrorFromCause(writeErrorCode(err), err),
        };
      }
    },
    readAuthConfig() {
      try {
        return {
          type: 'found',
          value: { ...getDefaultAuthConfig(), ...readCliAuthConfig(globalDir) },
        };
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return { type: 'missing' };
        }
        return {
          type: 'error',
          error: gatewayErrorFromCause(readErrorCode(err), err),
        };
      }
    },
    persistAuthConfig({ authConfig }) {
      try {
        persistCliAuthConfig(globalDir, authConfig);
        return { ok: true };
      } catch (err: unknown) {
        return {
          ok: false,
          error: {
            code: 'persist_failed',
            message: `Not able to create ${hp(authConfigFilePath)} (${errorToStringFriendly(
              err
            )}).`,
            details: { cause: err },
          },
        };
      }
    },
  };
}

/**
 * The store `Client` uses when none is injected: the import-time global
 * config directory from `util/config/files.ts`, accessed through that
 * module's functions so existing behaviour (and test spies) stay identical.
 */
export function defaultCliConfigStore(): CliConfigStore {
  return {
    get globalDir() {
      return configFiles.getGlobalConfigDir();
    },
    ensureGlobalDir() {
      try {
        ensureDirSync(configFiles.getGlobalConfigDir());
        return { ok: true };
      } catch (err: unknown) {
        return { ok: false, error: gatewayErrorFromCause('mkdir_failed', err) };
      }
    },
    readGlobalConfig() {
      try {
        return { type: 'found', value: configFiles.readConfigFile() };
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return { type: 'missing' };
        }
        return {
          type: 'error',
          error: gatewayErrorFromCause(readErrorCode(err), err),
        };
      }
    },
    writeGlobalConfig({ config }) {
      try {
        // Handles EPERM/EBADF itself by printing and exiting, like today.
        configFiles.writeToConfigFile(config);
        return { ok: true };
      } catch (err: unknown) {
        return {
          ok: false,
          error: gatewayErrorFromCause(writeErrorCode(err), err),
        };
      }
    },
    readAuthConfig() {
      try {
        return { type: 'found', value: configFiles.readAuthConfigFile({}) };
      } catch (err: unknown) {
        if (isEnoent(err)) {
          return { type: 'missing' };
        }
        return {
          type: 'error',
          error: gatewayErrorFromCause(readErrorCode(err), err),
        };
      }
    },
    persistAuthConfig({ authConfig }) {
      try {
        configFiles.persistAuthConfig(authConfig, {});
        return { ok: true };
      } catch (err: unknown) {
        return {
          ok: false,
          error: {
            code: 'persist_failed',
            message: err instanceof Error ? err.message : String(err),
            details: {
              cause:
                err instanceof Error
                  ? (err as Error & { cause?: unknown }).cause
                  : err,
            },
          },
        };
      }
    },
  };
}

/**
 * Reproduces the legacy `writeToConfigFile` behaviour for fatal write
 * failures: EPERM and EBADF print an error and exit the process. Returns for
 * any other failure so the caller can decide.
 */
export function exitOnFatalGlobalConfigWriteError(
  store: CliConfigStore,
  error: GatewayErrorInfo
): void {
  const configFilePath = getConfigFilePath(store.globalDir);
  if (error.code === 'EPERM') {
    output.error(
      `Not able to create ${highlight(configFilePath)} (operation not permitted).`
    );
    process.exit(1);
  } else if (error.code === 'EBADF') {
    output.error(
      `Not able to create ${highlight(configFilePath)} (bad file descriptor).`
    );
    process.exit(1);
  }
}

/**
 * Writes the global config with legacy `writeToConfigFile` semantics: exits
 * on EPERM/EBADF and rethrows the original error for anything else.
 */
export function writeGlobalConfigOrThrow(
  store: CliConfigStore,
  config: GlobalConfig
): void {
  const result = store.writeGlobalConfig({ config });
  if (result.ok) {
    return;
  }
  exitOnFatalGlobalConfigWriteError(store, result.error);
  throw gatewayErrorCause(result.error);
}
