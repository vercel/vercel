// Zod-free path helpers so hot paths (e.g. the `vc.js` shim) can locate and
// read the global config without loading zod and the config schemas.
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import XDGAppPaths from 'xdg-app-paths';

function isReadableDirectory(targetPath: string): boolean {
  try {
    return fs.lstatSync(targetPath).isDirectory();
  } catch (_) {
    return false;
  }
}

export function getGlobalPathConfig(): string {
  const vercelDirectories = XDGAppPaths('com.vercel.cli').dataDirs();

  const possibleConfigPaths = [
    ...vercelDirectories, // latest vercel directory
    path.join(homedir(), '.now'), // legacy config in user's home directory
    ...XDGAppPaths('now').dataDirs(), // legacy XDG directory
  ];

  return (
    possibleConfigPaths.find(configPath => isReadableDirectory(configPath)) ||
    vercelDirectories[0]
  );
}

export function getConfigFilePath(configDir: string): string {
  return path.join(configDir, 'config.json');
}

export function getAuthConfigFilePath(configDir: string): string {
  return path.join(configDir, 'auth.json');
}

// Reads a single key from the global config file without schema validation,
// for cheap feature-gate reads on hot paths.
export function readGlobalConfigFlag(configPath: string, key: string): unknown {
  try {
    const content = fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return (parsed as Record<string, unknown>)[key];
    }
  } catch {
    // Missing/unreadable/invalid config is treated as "no value".
  }
  return undefined;
}
