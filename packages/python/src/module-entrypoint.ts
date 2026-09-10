import { join } from 'path';
import fs from 'fs';

const MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;

const MODULE_RE = /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/;

export interface ModuleEntrypoint {
  moduleName: string;
  variableName: string;
  filePath: string;
}

export interface BareModuleEntrypoint {
  moduleName: string;
  variableName?: undefined;
  filePath: string;
}

/** Parses a `module:object` entrypoint string, or returns null if malformed. */
export function parseModuleEntrypoint(value: string): ModuleEntrypoint | null {
  const match = MODULE_ATTR_RE.exec(value);
  if (!match) {
    return null;
  }

  return {
    moduleName: match[1],
    variableName: match[2],
    filePath: `${match[1].replace(/\./g, '/')}.py`,
  };
}

/**
 * Parses a dotted `pkg.module` entrypoint string with no object attr, or
 * returns null if malformed. The module is imported by this name, so
 * relative imports and `__package__` behave exactly as they do at runtime.
 */
export function parseBareModuleEntrypoint(
  value: string
): BareModuleEntrypoint | null {
  if (!MODULE_RE.test(value)) {
    return null;
  }

  return {
    moduleName: value,
    filePath: `${value.replace(/\./g, '/')}.py`,
  };
}

export function getModuleEntrypointName({
  moduleName,
  variableName,
}: {
  moduleName: string;
  variableName?: string;
}): string {
  const base = moduleName.replace(/\./g, '-');
  return variableName === undefined ? base : `${base}_${variableName}`;
}

export function safePathSegment(value: string): string {
  return [...value]
    .map(char => {
      if (char === '_') {
        return '__';
      }
      return /[A-Za-z0-9-]/.test(char)
        ? char
        : `_${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

export async function resolveExistingEntrypoint(
  workPath: string,
  filePath: string
): Promise<string | null> {
  const candidates = [filePath, filePath.replace(/\.py$/i, '/__init__.py')];
  for (const candidate of candidates) {
    try {
      const stat = await fs.promises.stat(join(workPath, candidate));
      if (stat.isFile()) {
        return candidate;
      }
    } catch {}
  }
  return null;
}
