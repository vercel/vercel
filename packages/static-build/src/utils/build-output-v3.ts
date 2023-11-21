import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { BuildResultV2, Meta } from '@vercel/build-utils';
import { Framework } from '@vercel/frameworks';

const BUILD_OUTPUT_DIR = '.vercel/output';

/**
 * Returns the path to the Build Output API v3 directory when the
 * `config.json` file was created by the framework / build script,
 * or `undefined` if the framework did not create the v3 output.
 */
export async function getBuildOutputDirectory(
  path: string
): Promise<string | undefined> {
  try {
    const outputDir = join(path, BUILD_OUTPUT_DIR);
    const configPath = join(outputDir, 'config.json');
    await fs.stat(configPath);
    return outputDir;
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  return undefined;
}

export async function readConfig(
  path: string
): Promise<{ cache?: string[] } | undefined> {
  try {
    const outputDir = join(path, BUILD_OUTPUT_DIR);
    const configPath = join(outputDir, 'config.json');
    return JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  return undefined;
}

export function createBuildOutput(
  meta: Meta,
  buildCommand: string | null,
  buildOutputPath: string,
  framework: Framework | undefined
): BuildResultV2 {
  if (meta.isDev) {
    let buildCommandName: string;

    if (buildCommand) buildCommandName = `"${buildCommand}"`;
    else if (framework) buildCommandName = framework.name;
    else buildCommandName = 'the "build" script';

    throw new Error(
      `Detected Build Output v3 from ${buildCommandName}, but it is not supported for \`vercel dev\`. Please set the Development Command in your Project Settings.`
    );
  }

  return {
    buildOutputVersion: 3,
    buildOutputPath,
  };
}
