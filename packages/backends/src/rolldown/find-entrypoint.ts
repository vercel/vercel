import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
  workPath: string,
  options?: { ignoreRegex?: boolean }
) => {
  const ignoreRegex = options?.ignoreRegex ?? false;

  // If ignoreRegex is true, just find the first file that exists
  if (ignoreRegex) {
    for (const entrypoint of entrypoints) {
      if (existsSync(join(workPath, entrypoint))) {
        return entrypoint;
      }
    }
    for (const entrypoint of entrypoints) {
      if (existsSync(join(workPath, 'src', entrypoint))) {
        return join('src', entrypoint);
      }
    }
    throw new Error('No entrypoint file found');
  }

  // Original behavior: check for framework imports
  const packageJson = await readFile(join(workPath, 'package.json'), 'utf-8');
  const packageJsonObject = JSON.parse(packageJson);
  const framework = frameworks.find(
    framework => packageJsonObject.dependencies?.[framework]
  );

  if (!framework) {
    for (const entrypoint of entrypoints) {
      const entrypointPath = join(workPath, entrypoint);
      try {
        await readFile(entrypointPath, 'utf-8');
        return entrypoint;
      } catch (_e) {}
    }
    throw new Error('No entrypoint or framework found');
  }

  const regex = createFrameworkRegex(framework);

  for (const entrypoint of entrypoints) {
    const entrypointPath = join(workPath, entrypoint);
    try {
      const content = await readFile(entrypointPath, 'utf-8');
      if (regex.test(content)) {
        return entrypoint;
      }
    } catch (_) {
      // ignore
    }
  }
  for (const entrypoint of entrypoints) {
    const entrypointPath = join(workPath, 'src', entrypoint);
    try {
      const content = await readFile(entrypointPath, 'utf-8');
      if (regex.test(content)) {
        return join('src', entrypoint);
      }
    } catch (_) {
      // ignore
    }
  }
  throw new Error('No entrypoint found');
};
