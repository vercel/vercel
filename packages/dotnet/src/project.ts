import { dirname, join } from 'path';
import { glob } from '@vercel/build-utils';

/**
 * Find the .csproj file in the project directory.
 * Searches the entrypoint's directory first, then the workPath root.
 */
export async function findCsprojFile(
  workPath: string,
  entrypoint: string
): Promise<string> {
  const entrypointDir = dirname(join(workPath, entrypoint));

  let csprojFiles = await glob('*.csproj', entrypointDir);
  let keys = Object.keys(csprojFiles);

  if (keys.length === 0 && entrypointDir !== workPath) {
    csprojFiles = await glob('*.csproj', workPath);
    keys = Object.keys(csprojFiles);
  }

  if (keys.length === 0) {
    throw new Error(`No .csproj file found in ${entrypointDir} or ${workPath}`);
  }

  if (keys.length > 1) {
    throw new Error(
      `Multiple .csproj files found: ${keys.join(', ')}. ` +
        'Use a .sln file or set the entrypoint to the correct project directory.'
    );
  }

  return keys[0];
}

/**
 * Extract the project name from a .csproj filename.
 * "HelloWorld.csproj" -> "HelloWorld"
 */
export function getProjectName(csprojPath: string): string {
  const filename = csprojPath.split('/').pop() || csprojPath;
  return filename.replace(/\.csproj$/, '');
}
