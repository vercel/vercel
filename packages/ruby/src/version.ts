import { readFile } from 'fs-extra';
import { debug, readConfigFile, walkParentDirs } from '@vercel/build-utils';

type MiseRubyToolConfig =
  | string
  | { version?: string }
  | Array<string | { version?: string }>;

interface MiseTomlConfig {
  tools?: {
    ruby?: MiseRubyToolConfig;
  };
}

interface DeclaredRubyVersion {
  version: string;
  source: '.ruby-version' | '.tool-versions' | 'mise.toml' | 'Gemfile';
}

function normalizeDeclaredRubyVersion(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const unquoted = trimmed
    .replace(/^['"]/, '')
    .replace(/['"]$/, '')
    .replace(/^ruby[-@]/i, '');
  return unquoted || undefined;
}

function parseRubyVersionFile(content: string): string | undefined {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return normalizeDeclaredRubyVersion(trimmed);
  }
  return undefined;
}

function parseToolVersionsFile(content: string): string | undefined {
  const lines = content.split('\n');
  for (const line of lines) {
    const withoutComment = line.split('#')[0].trim();
    if (!withoutComment) continue;

    const [tool, ...versionTokens] = withoutComment.split(/\s+/);
    if (tool !== 'ruby' || versionTokens.length === 0) continue;

    return normalizeDeclaredRubyVersion(versionTokens[0]);
  }
  return undefined;
}

function parseMiseRubyVersion(config: MiseRubyToolConfig): string | undefined {
  if (typeof config === 'string') {
    return normalizeDeclaredRubyVersion(config);
  }
  if (Array.isArray(config)) {
    for (const entry of config) {
      const parsed = parseMiseRubyVersion(entry);
      if (parsed) return parsed;
    }
    return undefined;
  }

  if (config && typeof config === 'object' && 'version' in config) {
    const { version } = config;
    if (typeof version === 'string') {
      return normalizeDeclaredRubyVersion(version);
    }
  }

  return undefined;
}

async function readVersionFromRubyVersionFile(
  workPath: string,
  entrypointFsDirname: string
): Promise<DeclaredRubyVersion | undefined> {
  const rubyVersionPath = await walkParentDirs({
    base: workPath,
    start: entrypointFsDirname,
    filename: '.ruby-version',
  });
  if (!rubyVersionPath) return undefined;

  try {
    const content = await readFile(rubyVersionPath, 'utf8');
    const version = parseRubyVersionFile(content);
    if (version) {
      debug(`Found Ruby version ${version} in .ruby-version`);
      return { version, source: '.ruby-version' };
    }
  } catch (err) {
    debug('Failed to read .ruby-version file', err as Error);
  }

  return undefined;
}

async function readVersionFromToolVersionsFile(
  workPath: string,
  entrypointFsDirname: string
): Promise<DeclaredRubyVersion | undefined> {
  const toolVersionsPath = await walkParentDirs({
    base: workPath,
    start: entrypointFsDirname,
    filename: '.tool-versions',
  });
  if (!toolVersionsPath) return undefined;

  try {
    const content = await readFile(toolVersionsPath, 'utf8');
    const version = parseToolVersionsFile(content);
    if (version) {
      debug(`Found Ruby version ${version} in .tool-versions`);
      return { version, source: '.tool-versions' };
    }
  } catch (err) {
    debug('Failed to read .tool-versions file', err as Error);
  }

  return undefined;
}

async function readVersionFromMiseToml(
  workPath: string,
  entrypointFsDirname: string
): Promise<DeclaredRubyVersion | undefined> {
  const miseTomlPath = await walkParentDirs({
    base: workPath,
    start: entrypointFsDirname,
    filename: 'mise.toml',
  });
  if (!miseTomlPath) return undefined;

  try {
    const parsedMiseToml = await readConfigFile<MiseTomlConfig>(miseTomlPath);
    const rubyToolConfig = parsedMiseToml?.tools?.ruby;
    if (rubyToolConfig) {
      const version = parseMiseRubyVersion(rubyToolConfig);
      if (version) {
        debug(`Found Ruby version ${version} in mise.toml`);
        return { version, source: 'mise.toml' };
      }
    }
  } catch (err) {
    debug('Failed to parse mise.toml', err as Error);
  }

  return undefined;
}

export async function getDeclaredRubyVersion({
  workPath,
  entrypointFsDirname,
}: {
  workPath: string;
  entrypointFsDirname: string;
}): Promise<DeclaredRubyVersion | undefined> {
  return (
    (await readVersionFromRubyVersionFile(workPath, entrypointFsDirname)) ||
    (await readVersionFromToolVersionsFile(workPath, entrypointFsDirname)) ||
    (await readVersionFromMiseToml(workPath, entrypointFsDirname))
  );
}

export type { DeclaredRubyVersion };
