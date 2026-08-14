import { join } from 'path';
import fs from 'fs';

const MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;

export interface ModuleEntrypoint {
  moduleName: string;
  variableName: string;
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

export function getModuleEntrypointName({
  moduleName,
  variableName,
}: {
  moduleName: string;
  variableName: string;
}): string {
  return `${moduleName.replace(/\./g, '-')}_${variableName}`;
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
