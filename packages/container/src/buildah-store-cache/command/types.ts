export interface BuildahStorePaths {
  graphRoot: string;
  blobInfoCache: string;
}

export interface ExtractOptions extends BuildahStorePaths {
  archive: string;
}

export interface RestoreOptions extends ExtractOptions {
  storeLock: string;
  marker: string;
}

export interface SaveOptions extends ExtractOptions {
  stateDirectory: string;
  threads: number;
  buildahArgs: string[];
}

export interface CleanupOptions {
  record: string;
  buildahArgs: string[];
}

export type RestoreResult =
  | { status: 'hit'; bytes: number }
  | { status: 'miss'; reason: string }
  | { status: 'warm' | 'skipped' };

export type SaveResult =
  | { status: 'saved' | 'unused' }
  | { status: 'skipped'; previous: 'saved' | 'unused' | 'failed' };

export type StoreCommandRequest =
  | { action: 'restore'; options: RestoreOptions }
  | { action: 'extract'; options: ExtractOptions }
  | { action: 'save'; options: SaveOptions }
  | { action: 'cleanup'; options: CleanupOptions };

export interface StoreCommandResults {
  restore: RestoreResult;
  extract: RestoreResult;
  save: SaveResult;
}
