import { existsSync } from 'fs';
import { join } from 'path';
import type { VercelConfig } from '@vercel/client';
import { isErrnoException } from '@vercel/error-utils';
import {
  CantFindConfig,
  CantParseJSONFile,
  DeprecatedNowJson,
} from '../util/errors-ts';
import { readEarlyConfig } from '../util/get-config';
import { gatewayErrorFromCause, type GatewayErrorInfo } from './result';

export type EarlyLocalConfigResult =
  | { type: 'found'; config: VercelConfig }
  /** No config file was found at the searched paths. */
  | { type: 'missing'; searchedPaths: string[] }
  /**
   * Codes: `CANT_PARSE_JSON_FILE` (`details.file`), `DEPRECATED_NOW_JSON`
   * (`details.link`), `CWD_DOES_NOT_EXIST`. `details.cause` holds the
   * original error.
   */
  | { type: 'error'; error: GatewayErrorInfo };

/** Early local project config and target-path existence. */
export type LocalWorkspaceGateway = {
  readEarlyLocalConfig(input: {
    cwd: string;
    localConfigPath?: string;
  }): Promise<EarlyLocalConfigResult>;
  hasEntry(input: { cwd: string; name: string }): Promise<boolean>;
};

export function liveLocalWorkspace(): LocalWorkspaceGateway {
  return {
    async readEarlyLocalConfig({ cwd, localConfigPath }) {
      const result = await readEarlyConfig({
        cwd,
        configFile: localConfigPath,
      });

      if (!(result instanceof Error)) {
        return { type: 'found', config: result };
      }

      if (result instanceof CantFindConfig) {
        return { type: 'missing', searchedPaths: result.meta.paths };
      }

      if (result instanceof CantParseJSONFile) {
        return {
          type: 'error',
          error: gatewayErrorFromCause('CANT_PARSE_JSON_FILE', result, {
            file: result.meta.file,
          }),
        };
      }

      if (result instanceof DeprecatedNowJson) {
        return {
          type: 'error',
          error: gatewayErrorFromCause('DEPRECATED_NOW_JSON', result, {
            link: result.link,
          }),
        };
      }

      const code =
        isErrnoException(result) && result.code ? result.code : 'unknown';
      return { type: 'error', error: gatewayErrorFromCause(code, result) };
    },
    async hasEntry({ cwd, name }) {
      return existsSync(join(cwd, name));
    },
  };
}
