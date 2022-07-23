export interface SpawnError extends NodeJS.ErrnoException {
  spawnargs: string[];
}

export function isError(v: unknown): v is Error {
  return typeof v !== 'undefined' && v instanceof Error;
}

export function isErrnoException(v: unknown): v is NodeJS.ErrnoException {
  return isError(v) && 'code' in v;
}

export function isSpawnError(v: unknown): v is SpawnError {
  return isErrnoException(v) && 'spawnargs' in v;
}
