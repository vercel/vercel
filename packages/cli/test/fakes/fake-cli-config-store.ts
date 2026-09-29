import { resolve } from 'path';
import { getDefaultAuthConfig } from '@vercel/cli-config';
import type { AuthConfig, GlobalConfig } from '@vercel-internals/types';
import type { CliConfigStore } from '../../src/gateways/cli-config-store';
import type {
  GatewayErrorInfo,
  OperationResult,
  OptionalResult,
} from '../../src/gateways/result';

export type FakeCliConfigStoreState = {
  globalDir?: string;
  /** Stored `config.json`, or `'missing'` when the file does not exist. */
  globalConfig?: GlobalConfig | 'missing';
  /** Makes reading `config.json` fail. */
  globalConfigReadError?: GatewayErrorInfo;
  /** Makes writing `config.json` fail (codes `EPERM`, `EBADF`, `write_failed`). */
  globalConfigWriteError?: GatewayErrorInfo;
  /** Stored credentials, or `'missing'` when none exist. */
  authConfig?: AuthConfig | 'missing';
  /** Makes reading credentials fail. */
  authConfigReadError?: GatewayErrorInfo;
  /** Makes persisting credentials fail. */
  authConfigPersistError?: GatewayErrorInfo;
  /** Makes creating the global directory fail. */
  ensureGlobalDirError?: GatewayErrorInfo;
};

/** In-memory `CliConfigStore`. Copies values in and out. */
export class FakeCliConfigStore implements CliConfigStore {
  readonly globalDir: string;
  #globalConfig: GlobalConfig | undefined;
  #authConfig: AuthConfig | undefined;
  #state: FakeCliConfigStoreState;

  constructor(state: FakeCliConfigStoreState = {}) {
    this.#state = state;
    this.globalDir = state.globalDir ?? resolve('/fake-global-config');
    this.#globalConfig =
      state.globalConfig === undefined || state.globalConfig === 'missing'
        ? undefined
        : structuredClone(state.globalConfig);
    this.#authConfig =
      state.authConfig === undefined || state.authConfig === 'missing'
        ? undefined
        : structuredClone(state.authConfig);
  }

  /** The stored `config.json`, or `undefined` when missing. */
  get globalConfig(): GlobalConfig | undefined {
    return this.#globalConfig && structuredClone(this.#globalConfig);
  }

  /** The stored credentials, or `undefined` when missing. */
  get authConfig(): AuthConfig | undefined {
    return this.#authConfig && structuredClone(this.#authConfig);
  }

  ensureGlobalDir(): OperationResult {
    const error = this.#state.ensureGlobalDirError;
    return error ? { ok: false, error } : { ok: true };
  }

  readGlobalConfig(): OptionalResult<GlobalConfig> {
    if (this.#state.globalConfigReadError) {
      return { type: 'error', error: this.#state.globalConfigReadError };
    }
    if (!this.#globalConfig) {
      return { type: 'missing' };
    }
    return { type: 'found', value: structuredClone(this.#globalConfig) };
  }

  writeGlobalConfig({ config }: { config: GlobalConfig }): OperationResult {
    if (this.#state.globalConfigWriteError) {
      return { ok: false, error: this.#state.globalConfigWriteError };
    }
    this.#globalConfig = structuredClone(config);
    return { ok: true };
  }

  readAuthConfig(): OptionalResult<AuthConfig> {
    if (this.#state.authConfigReadError) {
      return { type: 'error', error: this.#state.authConfigReadError };
    }
    if (!this.#authConfig) {
      return { type: 'missing' };
    }
    return {
      type: 'found',
      value: {
        ...getDefaultAuthConfig(),
        ...structuredClone(this.#authConfig),
      },
    };
  }

  persistAuthConfig({
    authConfig,
  }: {
    authConfig: AuthConfig;
  }): OperationResult {
    if (this.#state.authConfigPersistError) {
      return { ok: false, error: this.#state.authConfigPersistError };
    }
    // Mirrors the live store: explicit `--token`/`VERCEL_TOKEN` credentials
    // are never written.
    if (authConfig.skipWrite) {
      return { ok: true };
    }
    const { skipWrite, tokenSource, ...persisted } =
      structuredClone(authConfig);
    this.#authConfig = persisted;
    return { ok: true };
  }
}
