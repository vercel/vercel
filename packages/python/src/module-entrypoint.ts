import fs from 'fs';
import { join } from 'path';

const MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;

export interface ModuleEntrypoint {
  moduleName: string;
  variableName: string;
  filePath: string;
}

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

export async function resolveEntrypointFile(
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
