import { getCachePath } from '@vercel/cli-config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** One-shot runs continue the last session for the same team and project if it is this fresh. */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

interface RecentEntry {
  sessionId: string;
  usedAt: number;
}

/** Lives in Vercel CLI's cache directory; the CLI's config files are left untouched. */
export function recentSessionsFile(): string {
  return join(getCachePath(), 'agent', 'recent-sessions.json');
}

/** Sessions are remembered per team and project (or directory, when nothing is linked). */
export function recentKey(
  teamId: string,
  projectId: string | undefined,
  cwd: string
): string {
  return `${teamId}:${projectId ?? cwd}`;
}

function read(file: string): Record<string, RecentEntry> {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function findRecentSession(
  file: string,
  key: string,
  now = Date.now()
): RecentEntry | undefined {
  const entry = read(file)[key];
  return entry && now - entry.usedAt < RESUME_WINDOW_MS ? entry : undefined;
}

export function rememberSession(
  file: string,
  key: string,
  sessionId: string,
  now = Date.now()
): void {
  try {
    const all = read(file);
    // Drop stale entries so the file stays small.
    for (const [k, v] of Object.entries(all)) {
      if (now - v.usedAt > RESUME_WINDOW_MS * 48) delete all[k];
    }
    all[key] = { sessionId, usedAt: now };
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
  } catch {}
}
