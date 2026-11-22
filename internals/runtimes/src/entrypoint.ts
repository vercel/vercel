import { posix as posixPath } from 'path';
import { CONTAINER_ENTRYPOINT_CANDIDATES } from './constants';

const PYTHON_MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;
const NODE_FILE_ENTRYPOINT_RE =
  /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?:[\w@+.-]+\/)*[\w@+.-]+\.[cm]?[jt]s$/;
const PYTHON_FILE_ENTRYPOINT_RE =
  /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))(?:[\w@+.-]+\/)*[\w@+.-]+\.py$/;
const NODE_DECLARATION_ENTRYPOINT_RE = /\.d\.[cm]?ts$/;

export type ParsedScheduleEntrypoint =
  | {
      runtime: 'python';
      filePath: string;
    }
  | {
      runtime: 'node';
      filePath: string;
    };

/**
 * Parse a Python `module:attr` entrypoint (e.g. `backend.jobs.scheduled:cleanup`)
 * into a file path and attribute name.
 *
 * Returns null if the string is not a valid `module:attr` reference.
 */
export function parsePyModuleAttrEntrypoint(entrypoint: string): {
  attrName: string;
  filePath: string;
  moduleName: string;
} | null {
  const match = PYTHON_MODULE_ATTR_RE.exec(entrypoint);
  if (!match) return null;
  const [, modulePart, attrName] = match;
  if (!modulePart || !attrName) return null;
  return {
    attrName,
    filePath: modulePart.replace(/\./g, '/') + '.py',
    moduleName: modulePart,
  };
}

/**
 * User-facing summary of the entrypoint forms `parseScheduleEntrypoint`
 * accepts. Keep in sync when adding a runtime.
 */
export const SCHEDULE_ENTRYPOINT_FORMS_HINT =
  'Use a source file path like "jobs/nightly.py" or "jobs/nightly.ts".';

/** Parse a supported schedule entrypoint without resolving it on disk. */
export function parseScheduleEntrypoint(
  entrypoint: string
): ParsedScheduleEntrypoint | null {
  if (PYTHON_FILE_ENTRYPOINT_RE.test(entrypoint)) {
    return { runtime: 'python', filePath: entrypoint };
  }
  if (
    NODE_FILE_ENTRYPOINT_RE.test(entrypoint) &&
    !NODE_DECLARATION_ENTRYPOINT_RE.test(entrypoint)
  ) {
    return { runtime: 'node', filePath: entrypoint };
  }
  return null;
}

const CONTAINER_ENTRYPOINT_BASENAMES = new Set(
  CONTAINER_ENTRYPOINT_CANDIDATES.map(name => name.toLowerCase())
);

/**
 * Returns true if the path names a blessed Dockerfile or Containerfile.
 * Suffixed names like `Dockerfile.prod` are intentionally not matched.
 */
export function isDockerfileEntrypoint(entrypoint: string): boolean {
  return CONTAINER_ENTRYPOINT_BASENAMES.has(
    posixPath.basename(entrypoint).toLowerCase()
  );
}

/**
 * Strip trailing slashes from a posixPath.normalize'd path.
 * An empty result or lone "/" collapses to ".".
 */
export function stripTrailingSlash(p: string): string {
  const stripped = p.replace(/\/+$/, '');
  return stripped === '' ? '.' : stripped;
}
