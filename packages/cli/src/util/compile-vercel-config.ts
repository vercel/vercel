import { existsSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import output from '../output-manager';
import { NowBuildError } from '@vercel/build-utils';
import { VERCEL_DIR } from './projects/link';
import { ConflictingConfigFiles } from './errors-ts';

export interface CompileConfigResult {
  configPath: string | null;
  wasCompiled: boolean;
}

export async function compileVercelConfig(
  workPath: string
): Promise<CompileConfigResult> {
  const vercelTsPath = join(workPath, 'vercel.ts');
  const vercelJsonPath = join(workPath, 'vercel.json');
  const nowJsonPath = join(workPath, 'now.json');
  const vercelDir = join(workPath, VERCEL_DIR);
  const compiledConfigPath = join(vercelDir, 'vercel.json');

  const hasVercelTs = existsSync(vercelTsPath);
  const hasVercelJson = existsSync(vercelJsonPath);
  const hasNowJson = existsSync(nowJsonPath);

  if (hasVercelTs && hasVercelJson) {
    throw new NowBuildError({
      code: 'conflicting_config_files',
      message:
        'Both vercel.ts and vercel.json exist in your project. Please use only one configuration method.',
      link: 'https://vercel.com/docs/projects/project-configuration',
    });
  }

  if (hasVercelJson && hasNowJson) {
    throw new ConflictingConfigFiles([vercelJsonPath, nowJsonPath]);
  }

  if (!hasVercelTs) {
    return {
      configPath: hasVercelJson
        ? vercelJsonPath
        : hasNowJson
          ? nowJsonPath
          : null,
      wasCompiled: false,
    };
  }

  output.debug('Compiling vercel.ts to .vercel/vercel.json');

  try {
    const { build } = await import('esbuild');

    await mkdir(vercelDir, { recursive: true });

    const tempOutPath = join(vercelDir, 'vercel-temp.js');

    await build({
      entryPoints: [vercelTsPath],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: tempOutPath,
      external: ['@vercel/router-sdk'],
      target: 'node14',
    });

    delete require.cache[require.resolve(tempOutPath)];
    const configModule = require(tempOutPath);
    const config = configModule.default || configModule;

    await writeFile(
      compiledConfigPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    output.debug(`Compiled vercel.ts -> ${compiledConfigPath}`);

    try {
      await unlink(tempOutPath);
    } catch (err) {
      output.debug(`Failed to cleanup temp file: ${err}`);
    }

    return {
      configPath: compiledConfigPath,
      wasCompiled: true,
    };
  } catch (error: any) {
    throw new NowBuildError({
      code: 'vercel_ts_compilation_failed',
      message: `Failed to compile vercel.ts: ${error.message}`,
      link: 'https://vercel.com/docs/projects/project-configuration',
    });
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
