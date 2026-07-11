import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import XDGAppPaths from 'xdg-app-paths';
import { z } from 'zod';
import { authConfigSchema, globalConfigSchema } from './schema';
import type { AuthConfig, AuthFileConfig, GlobalConfig } from './types';

const DOCS_URL =
  'https://vercel.com/docs/projects/project-configuration/global-configuration';

type WriteConfigFileOptions = {
  indent?: number | string;
  mode?: number;
};

export const defaultGlobalConfig: GlobalConfig = {
  '// Note':
    'This is your Vercel config file. For more information see the global configuration documentation.',
  '// Docs': `${DOCS_URL}#config.json`,
};

export function getDefaultAuthConfig(): AuthConfig {
  return {
    '// Note': 'This is your Vercel credentials file. DO NOT SHARE!',
    '// Docs': `${DOCS_URL}#auth.json`,
  };
}

export const defaultAuthConfig: AuthConfig = getDefaultAuthConfig();

function normalizeConfigError(error: unknown): never {
  if (error instanceof z.ZodError) {
    const credStorageIssue = error.issues.find(
      issue => issue.path[0] === 'credStorage'
    );

    if (credStorageIssue) {
      throw new Error(credStorageIssue.message);
    }
  }

  throw error;
}

export function parseGlobalConfig(value: unknown): GlobalConfig {
  try {
    return globalConfigSchema.parse(value);
  } catch (error) {
    normalizeConfigError(error);
  }
}

export function parseAuthConfig(value: unknown): AuthConfig {
  return authConfigSchema.parse(value);
}

export function parseAuthFileConfig(value: unknown): AuthFileConfig {
  const { tokenSource, ...authConfig } = parseAuthConfig(value);
  return authConfig;
}

function readJsonFileSync(filePath: string): unknown {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(content);
}

function writeJsonFileSync(
  filePath: string,
  value: unknown,
  options: WriteConfigFileOptions = {}
): void {
  const directory = path.dirname(filePath);
  const tempFilePath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const content = `${JSON.stringify(value, null, options.indent ?? 2)}\n`;

  fs.mkdirSync(directory, { recursive: true });

  try {
    fs.writeFileSync(tempFilePath, content, {
      encoding: 'utf8',
      mode: options.mode,
    });
    fs.renameSync(tempFilePath, filePath);
  } catch (error) {
    try {
      fs.rmSync(tempFilePath, { force: true });
    } catch {
      // Best-effort cleanup for failed atomic writes.
    }

    throw error;
  }
}

export function readConfigFile<S extends z.ZodType>(
  configPath: string,
  schema: S
): z.output<S> {
  return schema.parse(readJsonFileSync(configPath));
}

export function writeConfigFile<S extends z.ZodType>(
  configPath: string,
  schema: S,
  config: z.output<S>,
  options?: WriteConfigFileOptions
): void {
  const normalizedConfig = z.encode(schema, config);
  writeJsonFileSync(configPath, normalizedConfig, {
    indent: 2,
    ...options,
  });
}

function isReadableDirectory(targetPath: string): boolean {
  try {
    return fs.lstatSync(targetPath).isDirectory();
  } catch (_) {
    // We don't care which kind of error occured, it isn't a readable directory anyway.
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

export function readGlobalConfigFile(configPath: string): GlobalConfig {
  try {
    return readConfigFile(configPath, globalConfigSchema);
  } catch (error) {
    normalizeConfigError(error);
  }
}

export function writeGlobalConfigFile(
  configPath: string,
  config: GlobalConfig
): void {
  writeConfigFile(configPath, globalConfigSchema, config);
}

export function readAuthConfigFile(configPath: string): AuthConfig {
  return readConfigFile(configPath, authConfigSchema);
}

export function readAuthFileConfig(configPath: string): AuthFileConfig {
  return parseAuthFileConfig(readJsonFileSync(configPath));
}

export function readAuthConfig(configDir: string): AuthConfig {
  return readAuthConfigFile(getAuthConfigFilePath(configDir));
}

export function tryReadAuthConfig(configDir: string): AuthConfig | null {
  try {
    return readAuthConfig(configDir);
  } catch {
    return null;
  }
}

export function writeAuthConfigFile(
  configPath: string,
  authConfig: AuthConfig
): void {
  if (authConfig.skipWrite) {
    return;
  }

  writeConfigFile(configPath, authConfigSchema, authConfig, {
    mode: 0o600,
  });
}

export function writeAuthConfig(
  configDir: string,
  authConfig: AuthConfig
): void {
  writeAuthConfigFile(getAuthConfigFilePath(configDir), authConfig);
}

export function deleteAuthConfigFile(configPath: string): void {
  fs.rmSync(configPath, { force: true });
}

export function deleteAuthConfig(configDir: string): void {
  deleteAuthConfigFile(getAuthConfigFilePath(configDir));
}
