import { readFile, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
import { LocalFileSystemDetector } from '@vercel/fs-detectors';
import {
  detectServices,
  generateServiceRewrites,
  type ConfiguredServices,
  type ConfiguredServicesType,
  type DetectServicesResult,
  type InferredServicesConfig,
} from '@vercel-internals/service-topology';
import type { Rewrite } from '@vercel/routing-utils';
import type { Services } from '@vercel/build-utils';
import type { VercelConfig } from '../dev/types';
import { compileVercelConfig } from '../compile-vercel-config';
import { CantParseJSONFile } from '../errors-ts';
import readJSONFile from '../read-json-file';
import { validateConfig } from '../validate-config';
import { createDetectEntrypoint } from './detect-entrypoint';

export type ServicesConfigWriteBlocker = 'builds' | 'functions';

function getServicesConfiguration(config?: VercelConfig | null) {
  const configuredServices: ConfiguredServices | undefined =
    config?.services ??
    config?.experimentalServicesV2 ??
    config?.experimentalServices;
  const configuredServicesType: ConfiguredServicesType | undefined =
    config?.services
      ? 'services'
      : config?.experimentalServicesV2
        ? 'experimentalServicesV2'
        : config?.experimentalServices
          ? 'experimentalServices'
          : undefined;

  return { configuredServices, configuredServicesType };
}

export async function loadVercelConfig(
  cwd: string
): Promise<VercelConfig | null> {
  try {
    const { configPath } = await compileVercelConfig(cwd);
    if (!configPath) return null;

    const config = await readJSONFile<VercelConfig>(configPath);
    return config instanceof Error ? null : config;
  } catch {
    return null;
  }
}

function isServicesEnvEnabled(): boolean {
  const value = process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
  return value === '1' || value?.toLowerCase() === 'true';
}

/**
 * Check if vercel.json in the given directory has services configured
 * or VERCEL_USE_EXPERIMENTAL_SERVICES environment variable is set.
 */
export async function isExperimentalServicesEnabled(
  cwd: string
): Promise<boolean> {
  const { configuredServices } = getServicesConfiguration(
    await loadVercelConfig(cwd)
  );
  return isServicesEnvEnabled() || configuredServices !== undefined;
}

/**
 * Detect services if experimental services are enabled.
 *
 * Returns the detection result if any of the following is true:
 * - vercel.json contains services or experimentalServices with valid services
 * - VERCEL_USE_EXPERIMENTAL_SERVICES env var is set (enables auto-detection of services)
 *
 * Returns null otherwise.
 */
export async function tryDetectServices(
  cwd: string,
  config?: VercelConfig | null
): Promise<DetectServicesResult | null> {
  if (config === undefined) {
    config = await loadVercelConfig(cwd);
  }
  const configuration = getServicesConfiguration(config);
  if (!isServicesEnvEnabled() && !configuration.configuredServices) {
    return null;
  }

  const fs = new LocalFileSystemDetector(cwd);
  const result = await detectServices({
    fs,
    configuredServices: configuration.configuredServices,
    configuredServicesType: configuration.configuredServicesType,
    detectEntrypoint: createDetectEntrypoint(cwd),
  });

  // No services configured
  const hasNoServicesError = result.errors.some(
    e => e.code === 'NO_SERVICES_CONFIGURED'
  );
  if (hasNoServicesError) {
    return null;
  }

  return result;
}

export async function writeServicesConfig(
  cwd: string,
  config: InferredServicesConfig
): Promise<{ configFileName: string }> {
  const prepared = await prepareServicesConfigWrite(cwd, config);
  await writeFile(prepared.configPath, prepared.content, 'utf8');
  return { configFileName: basename(prepared.configPath) };
}

export async function getServicesConfigWriteBlocker(
  cwd: string,
  config: InferredServicesConfig
): Promise<ServicesConfigWriteBlocker | null> {
  try {
    await prepareServicesConfigWrite(cwd, config);
    return null;
  } catch (error) {
    return getServicesConfigWriteBlockerFromError(error);
  }
}

function toProjectServicesConfigPatch(
  config: InferredServicesConfig
): Pick<VercelConfig, 'services' | 'rewrites'> {
  const services: Services = {};
  for (const [name, svc] of Object.entries(config)) {
    // Combine preDeployCommand into buildCommand since V2 ServiceConfig
    // doesn't have a separate preDeployCommand field.
    const buildCommand =
      svc.preDeployCommand && svc.buildCommand
        ? `${svc.buildCommand} && ${svc.preDeployCommand}`
        : svc.preDeployCommand || svc.buildCommand;

    services[name] = {
      root: svc.root,
      ...(svc.framework ? { framework: svc.framework } : {}),
      ...(svc.entrypoint ? { entrypoint: svc.entrypoint } : {}),
      ...(buildCommand ? { buildCommand } : {}),
    };
  }
  const rewrites: Rewrite[] = generateServiceRewrites(config);
  return {
    services,
    ...(rewrites.length > 0 ? { rewrites } : {}),
  };
}

async function prepareServicesConfigWrite(
  cwd: string,
  config: InferredServicesConfig
): Promise<{
  configPath: string;
  content: string;
}> {
  const compileResult = await compileVercelConfig(cwd);
  const configPath = join(cwd, 'vercel.json');

  if (compileResult.sourceFile === 'vercel.toml') {
    return prepareTomlServicesConfigWrite(join(cwd, 'vercel.toml'), config);
  }

  if (compileResult.wasCompiled) {
    throw new Error(
      `Cannot automatically update ${compileResult.sourceFile ?? 'the current Vercel config'}.`
    );
  }

  let existingConfig: VercelConfig = {};
  if (
    compileResult.configPath &&
    basename(compileResult.configPath) === 'vercel.json'
  ) {
    const result = await readJSONFile<VercelConfig>(configPath);
    if (result instanceof CantParseJSONFile) {
      throw result;
    }
    existingConfig = result ?? {};
  }

  const patch = toProjectServicesConfigPatch(config);
  const nextConfig: VercelConfig = {
    ...existingConfig,
    ...patch,
    // Preserve existing user rewrites; append auto-detected service rewrites.
    ...(patch.rewrites
      ? {
          rewrites: [
            ...((existingConfig.rewrites as Rewrite[]) ?? []),
            ...patch.rewrites,
          ],
        }
      : {}),
  };
  const validationError = validateConfig(nextConfig);
  if (validationError) {
    throw validationError;
  }

  return {
    configPath,
    content: JSON.stringify(nextConfig, null, 2) + '\n',
  };
}

async function prepareTomlServicesConfigWrite(
  configPath: string,
  config: InferredServicesConfig
): Promise<{ configPath: string; content: string }> {
  // Generate a toml file with our new config settings.
  // Append the new settings to the old file contents *textually*,
  // so that any formatting and comments are preserved.
  const patch = toProjectServicesConfigPatch(config);
  const patchKeys = Object.keys(patch);

  let existingContent: string;
  try {
    existingContent = await readFile(configPath, 'utf8');
  } catch {
    existingContent = '';
  }

  // If there was existing content, make sure the keys don't overlap
  // with our new keys, since could cause trouble.
  if (existingContent.trim()) {
    const existingParsed = tomlParse(existingContent);
    const overlapping = patchKeys.filter(key => key in existingParsed);
    if (overlapping.length > 0) {
      const plural = overlapping.length > 1;
      const keyList = overlapping.map(k => `"${k}"`).join(', ');
      throw new Error(
        `Cannot automatically update vercel.toml: key${plural ? 's' : ''} ${keyList} already exist${plural ? '' : 's'}.`
      );
    }
  }

  const patchToml = tomlStringify(patch);
  const content = existingContent.trim()
    ? existingContent.trimEnd() + '\n\n' + patchToml + '\n'
    : patchToml + '\n';

  return { configPath, content };
}

function getServicesConfigWriteBlockerFromError(
  error: unknown
): ServicesConfigWriteBlocker | null {
  switch ((error as { code?: string })?.code) {
    case 'EXPERIMENTAL_SERVICES_AND_BUILDS':
    case 'SERVICES_AND_BUILDS':
      return 'builds';
    case 'EXPERIMENTAL_SERVICES_AND_FUNCTIONS':
    case 'SERVICES_AND_FUNCTIONS':
      return 'functions';
    default:
      return null;
  }
}
