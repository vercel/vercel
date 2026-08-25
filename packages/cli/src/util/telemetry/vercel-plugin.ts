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
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface VercelPluginActiveSessionMarker {
  pluginVersion: string;
  installId?: string;
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

    // `installId` is absent on plugins older than 0.49.0 and must never
    // invalidate the marker — dropping the field keeps the active-session and
    // version events flowing for those installs.
    const installId =
      typeof marker.installId === 'string' && UUID_V4_RE.test(marker.installId)
        ? marker.installId
        : undefined;

    return {
      pluginVersion: marker.pluginVersion,
      ...(installId ? { installId } : {}),
    };
  } catch {
    return null;
  }
}
