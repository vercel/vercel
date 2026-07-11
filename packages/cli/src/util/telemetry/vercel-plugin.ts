import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ACTIVE_SESSION_MARKER_PATH = join(
  homedir(),
  '.config',
  'vercel-plugin',
  'active-session.json'
);
const SEMVERISH_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export interface VercelPluginActiveSessionMarker {
  pluginVersion: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readVercelPluginActiveSessionMarker(
  opts: { filePath?: string; now?: () => number } = {}
): VercelPluginActiveSessionMarker | null {
  const filePath = opts.filePath ?? ACTIVE_SESSION_MARKER_PATH;
  const now = opts.now?.() ?? Date.now();

  try {
    const marker = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;

    if (!isRecord(marker)) {
      return null;
    }

    if (marker.schema !== 1 || marker.active !== true) {
      return null;
    }

    if (typeof marker.expiresAt !== 'number' || marker.expiresAt <= now) {
      return null;
    }

    if (
      typeof marker.pluginVersion !== 'string' ||
      !SEMVERISH_RE.test(marker.pluginVersion)
    ) {
      return null;
    }

    return {
      pluginVersion: marker.pluginVersion,
    };
  } catch {
    return null;
  }
}
