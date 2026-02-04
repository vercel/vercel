import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const frameworks = [
  'express',
  'hono',
  'elysia',
  'fastify',
  '@nestjs/core',
  'h3',
];

const entrypointFilenames = ['app', 'index', 'server', 'main'];

const entrypointExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

const entrypoints = entrypointFilenames.flatMap(filename =>
  entrypointExtensions.map(extension => `${filename}.${extension}`)
);

const createFrameworkRegex = (framework: string) =>
  new RegExp(
    `(?:from|require|import)\\s*(?:\\(\\s*)?["']${framework}["']\\s*(?:\\))?`,
    'g'
  );

export const findEntrypoint = async (
  cwd: string,
  options?: { ignoreRegex?: boolean }
) => {
  const ignoreRegex = options?.ignoreRegex ?? false;

  // If ignoreRegex is true, just find the first file that exists
  if (ignoreRegex) {
    for (const entrypoint of entrypoints) {
      if (existsSync(join(cwd, entrypoint))) {
        return entrypoint;
      }
    }
    for (const entrypoint of entrypoints) {
      if (existsSync(join(cwd, 'src', entrypoint))) {
        return join('src', entrypoint);
      }
    }
    throw new Error('No entrypoint file found');
  }

  let framework: string | undefined;
  try {
    // Original behavior: check for framework imports
    const packageJson = await readFile(join(cwd, 'package.json'), 'utf-8');
    const packageJsonObject = JSON.parse(packageJson);
    framework = frameworks.find(
      framework => packageJsonObject.dependencies?.[framework]
    );
  } catch (_) {
    // ignore
  }

  if (!framework) {
    for (const entrypoint of entrypoints) {
      const entrypointPath = join(cwd, entrypoint);
      try {
        await readFile(entrypointPath, 'utf-8');
        return entrypoint;
      } catch (_) {
        // ignore
      }
    }
    throw new Error('No entrypoint or framework found');
  }

  const regex = createFrameworkRegex(framework);

  for (const entrypoint of entrypoints) {
    const entrypointPath = join(cwd, entrypoint);
    try {
      const content = await readFile(entrypointPath, 'utf-8');
      if (regex.test(content)) {
        return entrypoint;
      }
    } catch (e) {
      continue;
    }
  }
  for (const entrypoint of entrypoints) {
    const entrypointPath = join(cwd, 'src', entrypoint);
    try {
      const content = await readFile(entrypointPath, 'utf-8');
      if (regex.test(content)) {
        return join('src', entrypoint);
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('No entrypoint found');
};
