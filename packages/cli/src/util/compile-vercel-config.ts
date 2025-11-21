import { existsSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join, basename } from 'path';
import { config as dotenvConfig } from 'dotenv';
import output from '../output-manager';
import { NowBuildError } from '@vercel/build-utils';
import { VERCEL_DIR } from './projects/link';
import { ConflictingConfigFiles } from './errors-ts';

export interface CompileConfigResult {
  configPath: string | null;
  wasCompiled: boolean;
}

const VERCEL_CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs', 'cjs'] as const;

function findAllVercelConfigFiles(workPath: string): string[] {
  const foundFiles: string[] = [];
  for (const ext of VERCEL_CONFIG_EXTENSIONS) {
    const configPath = join(workPath, `vercel.${ext}`);
    if (existsSync(configPath)) {
      foundFiles.push(configPath);
    }
  }
  return foundFiles;
}

function findVercelConfigFile(workPath: string): string | null {
  const foundFiles = findAllVercelConfigFiles(workPath);

  if (foundFiles.length > 1) {
    throw new ConflictingConfigFiles(
      foundFiles,
      'Multiple vercel config files found. Please use only one configuration file.',
      'https://vercel.com/docs/projects/project-configuration'
    );
  }

  return foundFiles[0] || null;
}

export async function compileVercelConfig(
  workPath: string
): Promise<CompileConfigResult> {
  const vercelJsonPath = join(workPath, 'vercel.json');
  const nowJsonPath = join(workPath, 'now.json');
  const hasVercelJson = existsSync(vercelJsonPath);
  const hasNowJson = existsSync(nowJsonPath);

  // Check for conflicting vercel.json and now.json
  if (hasVercelJson && hasNowJson) {
    throw new ConflictingConfigFiles([vercelJsonPath, nowJsonPath]);
  }

  // Only check for vercel.{ext} if feature flag is enabled
  if (!process.env.VERCEL_TS_CONFIG_ENABLED) {
    return {
      configPath: hasVercelJson
        ? vercelJsonPath
        : hasNowJson
          ? nowJsonPath
          : null,
      wasCompiled: false,
    };
  }

  const vercelConfigPath = findVercelConfigFile(workPath);
  const vercelDir = join(workPath, VERCEL_DIR);
  const compiledConfigPath = join(vercelDir, 'vercel.json');

  if (vercelConfigPath && hasNowJson) {
    throw new ConflictingConfigFiles(
      [vercelConfigPath, nowJsonPath],
      `Both ${basename(vercelConfigPath)} and now.json exist in your project. Please use only one configuration method.`,
      'https://vercel.com/docs/projects/project-configuration'
    );
  }

  if (vercelConfigPath && hasVercelJson) {
    throw new ConflictingConfigFiles(
      [vercelConfigPath, vercelJsonPath],
      `Both ${basename(vercelConfigPath)} and vercel.json exist in your project. Please use only one configuration method.`,
      'https://vercel.com/docs/projects/project-configuration'
    );
  }

  if (!vercelConfigPath) {
    return {
      configPath: hasVercelJson
        ? vercelJsonPath
        : hasNowJson
          ? nowJsonPath
          : null,
      wasCompiled: false,
    };
  }

  dotenvConfig({ path: join(workPath, '.env') });
  dotenvConfig({ path: join(workPath, '.env.local') });

  const tempOutPath = join(vercelDir, 'vercel-temp.js');

  try {
    const { build } = await import('esbuild');

    await mkdir(vercelDir, { recursive: true });

    await build({
      entryPoints: [vercelConfigPath],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: tempOutPath,
      packages: 'external',
      target: 'node18',
      sourcemap: 'inline',
    });

    delete require.cache[require.resolve(tempOutPath)];
    const configModule = require(tempOutPath);
    const config = configModule.default || configModule.config || configModule;

    await writeFile(
      compiledConfigPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    output.debug(`Compiled ${vercelConfigPath} -> ${compiledConfigPath}`);

    return {
      configPath: compiledConfigPath,
      wasCompiled: true,
    };
  } catch (error: any) {
    throw new NowBuildError({
      code: 'vercel_ts_compilation_failed',
      message: `Failed to compile ${vercelConfigPath}: ${error.message}`,
      link: 'https://vercel.com/docs/projects/project-configuration',
    });
  } finally {
    try {
      await unlink(tempOutPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        output.debug(`Failed to cleanup temp file: ${err}`);
      }
    }
  }
}

export function getVercelConfigPath(workPath: string): string {
  const vercelJsonPath = join(workPath, 'vercel.json');
  const compiledConfigPath = join(workPath, VERCEL_DIR, 'vercel.json');

  if (existsSync(compiledConfigPath)) {
    return compiledConfigPath;
  }

  return vercelJsonPath;
}
