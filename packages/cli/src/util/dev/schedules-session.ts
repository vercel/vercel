import { randomUUID } from 'crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'fs/promises';
import { isAbsolute, join } from 'path';
import { isErrnoException } from '@vercel/error-utils';

export interface LocalSchedulesSession {
  version: 1;
  id: string;
  pid: number;
  cwd: string;
  origin: string;
  projectId: string;
}

export const LOCAL_SCHEDULES_SESSION_HEADER = 'x-vercel-schedules-dev-session';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLocalSchedulesOrigin(origin: unknown): origin is string {
  if (typeof origin !== 'string') return false;
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(origin);
  return !!match && match[0] === origin && Number(match[1]) <= 65535;
}

export async function createLocalSchedulesSession(
  cwd: string,
  origin: string,
  projectId: string
): Promise<{ session: LocalSchedulesSession; dispose: () => Promise<void> }> {
  if (!isLocalSchedulesOrigin(origin) || !projectId.trim()) {
    throw new Error(
      'Cannot publish local Schedules: expected an HTTP 127.0.0.1 origin with a valid port and a project ID.'
    );
  }
  const canonicalCwd = await realpath(cwd);
  const directory = join(canonicalCwd, '.vercel', 'dev', 'schedules');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const session: LocalSchedulesSession = {
    version: 1,
    id: randomUUID(),
    pid: process.pid,
    cwd: canonicalCwd,
    origin,
    projectId,
  };
  const filename = join(directory, `${session.id}.json`);
  const temporary = join(directory, `${session.id}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(session), {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporary, filename);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { session, dispose: () => rm(filename, { force: true }) };
}

export async function readLocalSchedulesSessions(
  cwd: string
): Promise<LocalSchedulesSession[]> {
  const canonicalCwd = await realpath(cwd);
  const directory = join(canonicalCwd, '.vercel', 'dev', 'schedules');
  let filenames: string[];
  try {
    filenames = await readdir(directory);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return [];
    throw error;
  }
  const sessions: LocalSchedulesSession[] = [];
  for (const filename of filenames.sort()) {
    if (!filename.endsWith('.json')) continue;
    const path = join(directory, filename);
    let session: LocalSchedulesSession;
    try {
      if (filename.length !== 41 || !uuidPattern.test(filename.slice(0, -5))) {
        throw new Error('expected a UUID filename');
      }
      if (!(await lstat(path)).isFile()) {
        throw new Error('expected a regular session file');
      }
      session = JSON.parse(await readFile(path, 'utf8'));
      if (!session || session.version !== 1) {
        throw new Error('unsupported session version (expected version 1)');
      }
      if (
        session.id !== filename.slice(0, -5) ||
        !Number.isSafeInteger(session.pid) ||
        session.pid <= 0 ||
        typeof session.cwd !== 'string' ||
        !isAbsolute(session.cwd) ||
        !isLocalSchedulesOrigin(session.origin) ||
        typeof session.projectId !== 'string' ||
        !session.projectId.trim()
      ) {
        throw new Error('invalid session descriptor');
      }
      try {
        process.kill(session.pid, 0);
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ESRCH') continue;
        if (!isErrnoException(error) || error.code !== 'EPERM') throw error;
      }
      if ((await realpath(session.cwd)) !== canonicalCwd) {
        throw new Error(
          'session directory does not match the current directory'
        );
      }
    } catch (error) {
      // An instance can remove its descriptor between readdir and readFile.
      if (isErrnoException(error) && error.code === 'ENOENT') {
        try {
          await lstat(path);
        } catch (missing) {
          if (isErrnoException(missing) && missing.code === 'ENOENT') continue;
          throw missing;
        }
      }
      throw new Error(
        `Cannot read local Schedules session ${path}: ${error instanceof Error ? error.message : String(error)}. Stop vercel dev, remove this descriptor, and restart vercel dev in the current directory.`
      );
    }
    sessions.push(session);
  }
  return sessions;
}
