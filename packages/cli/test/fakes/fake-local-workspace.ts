import { resolve } from 'path';
import type { VercelConfig } from '@vercel/client';
import { CantParseJSONFile, DeprecatedNowJson } from '../../src/util/errors-ts';
import humanizePath from '../../src/util/humanize-path';
import type {
  EarlyLocalConfigResult,
  LocalWorkspaceGateway,
} from '../../src/gateways/local-workspace';

export type FakeLocalWorkspaceState = {
  /**
   * Project config files keyed by path (resolved with `path.resolve`), e.g.
   * `vercel.json` in the working directory. `'invalid-json'` models a file
   * that can't be parsed.
   */
  files?: Record<string, VercelConfig | 'invalid-json'>;
  /** Other paths that exist on disk. */
  entries?: string[];
};

/** In-memory `LocalWorkspaceGateway` with the live lookup rules. */
export class FakeLocalWorkspace implements LocalWorkspaceGateway {
  #files: Map<string, VercelConfig | 'invalid-json'>;
  #entries: Set<string>;

  constructor(state: FakeLocalWorkspaceState = {}) {
    this.#files = new Map(
      Object.entries(state.files ?? {}).map(([path, value]) => [
        resolve(path),
        value === 'invalid-json' ? value : structuredClone(value),
      ])
    );
    this.#entries = new Set((state.entries ?? []).map(path => resolve(path)));
  }

  async readEarlyLocalConfig({
    cwd,
    localConfigPath,
  }: {
    cwd: string;
    localConfigPath?: string;
  }): Promise<EarlyLocalConfigResult> {
    if (localConfigPath) {
      const filePath = resolve(cwd, localConfigPath);
      const file = this.#files.get(filePath);
      if (file === 'invalid-json') {
        return parseError(filePath);
      }
      if (!file) {
        return { type: 'missing', searchedPaths: [humanizePath(filePath)] };
      }
      return { type: 'found', config: structuredClone(file) };
    }

    const vercelFilePath = resolve(cwd, 'vercel.json');
    const nowFilePath = resolve(cwd, 'now.json');
    const vercelFile = this.#files.get(vercelFilePath);
    const nowFile = this.#files.get(nowFilePath);

    if (vercelFile === 'invalid-json') {
      return parseError(vercelFilePath);
    }
    if (nowFile === 'invalid-json') {
      return parseError(nowFilePath);
    }
    if (vercelFile) {
      return { type: 'found', config: structuredClone(vercelFile) };
    }
    if (nowFile) {
      const cause = new DeprecatedNowJson(nowFilePath);
      return {
        type: 'error',
        error: {
          code: 'DEPRECATED_NOW_JSON',
          message: cause.message,
          details: { link: cause.link, cause },
        },
      };
    }
    return { type: 'missing', searchedPaths: [humanizePath(vercelFilePath)] };
  }

  async hasEntry({
    cwd,
    name,
  }: {
    cwd: string;
    name: string;
  }): Promise<boolean> {
    const path = resolve(cwd, name);
    return this.#entries.has(path) || this.#files.has(path);
  }
}

function parseError(file: string): EarlyLocalConfigResult {
  const cause = new CantParseJSONFile(file, 'Unexpected token (fake)');
  return {
    type: 'error',
    error: {
      code: 'CANT_PARSE_JSON_FILE',
      message: cause.message,
      details: { file, cause },
    },
  };
}
