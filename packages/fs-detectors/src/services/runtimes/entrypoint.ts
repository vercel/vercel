import { posix as posixPath } from 'path';

const PYTHON_MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;

/**
 * Parse a Python `module:attr` entrypoint (e.g. `backend.jobs.scheduled:cleanup`)
 * into a file path and attribute name.
 *
 * Returns null if the string is not a valid `module:attr` reference.
 */
export function parsePyModuleAttrEntrypoint(entrypoint: string): {
  attrName: string;
  filePath: string;
} | null {
  const match = PYTHON_MODULE_ATTR_RE.exec(entrypoint);
  if (!match) return null;
  const [, modulePart, attrName] = match;
  if (!modulePart || !attrName) return null;
  return {
    attrName,
    filePath: modulePart.replace(/\./g, '/') + '.py',
  };
}

/** Recognize explicit Dockerfile/Containerfile paths, with the name anywhere in the basename. */
export function isDockerfileEntrypoint(entrypoint: string): boolean {
  return /(docker|container)file/i.test(posixPath.basename(entrypoint));
}

/**
 * Strip trailing slashes from a posixPath.normalize'd path.
 * An empty result or lone "/" collapses to ".".
 */
export function stripTrailingSlash(p: string): string {
  const stripped = p.replace(/\/+$/, '');
  return stripped === '' ? '.' : stripped;
}
