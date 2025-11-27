import { mkdir, writeFile, unlink, access } from 'fs/promises';
import { join, basename } from 'path';
import { fork } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import output from '../output-manager';
import { NowBuildError } from '@vercel/build-utils';
import { VERCEL_DIR } from './projects/link';
import { ConflictingConfigFiles } from './errors-ts';

export interface CompileConfigResult {
  configPath: string | null;
  wasCompiled: boolean;
  sourceFile?: string;
}

const VERCEL_CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs', 'cjs'] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findAllVercelConfigFiles(workPath: string): Promise<string[]> {
  const foundFiles: string[] = [];
  for (const ext of VERCEL_CONFIG_EXTENSIONS) {
    const configPath = join(workPath, `vercel.${ext}`);
    if (await fileExists(configPath)) {
      foundFiles.push(configPath);
    }
  }
  return foundFiles;
}

/**
 * Finds the source vercel config file basename (e.g., 'vercel.ts', 'vercel.js')
 * @param workPath - The directory to search in
 * @returns The basename of the config file, or null if not found
 */
export async function findSourceVercelConfigFile(
  workPath: string
): Promise<string | null> {
  for (const ext of VERCEL_CONFIG_EXTENSIONS) {
    const configPath = join(workPath, `vercel.${ext}`);
    if (await fileExists(configPath)) {
      return basename(configPath);
    }
  }
  return null;
}

async function findVercelConfigFile(workPath: string): Promise<string | null> {
  const foundFiles = await findAllVercelConfigFiles(workPath);

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
  const hasVercelJson = await fileExists(vercelJsonPath);
  const hasNowJson = await fileExists(nowJsonPath);

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

  const vercelConfigPath = await findVercelConfigFile(workPath);
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

  const tempOutPath = join(vercelDir, 'vercel-temp.mjs');
  const loaderPath = join(vercelDir, 'vercel-loader.mjs');

  try {
    const { build } = await import('esbuild');

    await mkdir(vercelDir, { recursive: true });

    await build({
      entryPoints: [vercelConfigPath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: tempOutPath,
      packages: 'external',
      target: 'node20',
      sourcemap: 'inline',
    });

    const loaderScript = `
      import { pathToFileURL } from 'url';
      const configModule = await import(pathToFileURL(process.argv[2]).href);
      const config = ('default' in configModule) ? configModule.default : ('config' in configModule) ? configModule.config : configModule;
      process.send(config);
    `;
    await writeFile(loaderPath, loaderScript, 'utf-8');

    const config = await new Promise((resolve, reject) => {
      const child = fork(loaderPath, [tempOutPath], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('Config loader timed out after 10 seconds'));
      }, 10000);

      child.on('message', message => {
        clearTimeout(timeout);
        child.kill();
        resolve(message);
      });

      child.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on('exit', code => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Config loader exited with code ${code}`));
        }
      });
    });

    await writeFile(
      compiledConfigPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    output.debug(`Compiled ${vercelConfigPath} -> ${compiledConfigPath}`);

    return {
      configPath: compiledConfigPath,
      wasCompiled: true,
      sourceFile: (await findSourceVercelConfigFile(workPath)) ?? undefined,
    };
  } catch (error: any) {
    throw new NowBuildError({
      code: 'vercel_ts_compilation_failed',
      message: `Failed to compile ${vercelConfigPath}: ${error.message}`,
      link: 'https://vercel.com/docs/projects/project-configuration',
    });
  } finally {
    await Promise.all([
      unlink(tempOutPath).catch(err => {
        if (err.code !== 'ENOENT') {
          output.debug(`Failed to cleanup temp file: ${err}`);
        }
      }),
      unlink(loaderPath).catch(err => {
        if (err.code !== 'ENOENT') {
          output.debug(`Failed to cleanup loader file: ${err}`);
        }
      }),
    ]);
  }
}

export async function getVercelConfigPath(workPath: string): Promise<string> {
  const vercelJsonPath = join(workPath, 'vercel.json');
  const nowJsonPath = join(workPath, 'now.json');
  const compiledConfigPath = join(workPath, VERCEL_DIR, 'vercel.json');

  if (await fileExists(compiledConfigPath)) {
    return compiledConfigPath;
  }

  if (await fileExists(vercelJsonPath)) {
    return vercelJsonPath;
  }

  return nowJsonPath;
}
