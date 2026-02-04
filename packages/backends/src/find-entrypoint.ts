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

const entrypointFilenames = [
  'app',
  'index',
  'server',
  'main',
  'src/app',
  'src/index',
  'src/server',
  'src/main',
];

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
  cwd: string
): Promise<string | undefined> => {
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
  }

  const regex = framework ? createFrameworkRegex(framework) : undefined;

  for (const entrypoint of entrypoints) {
    const entrypointPath = join(cwd, entrypoint);
    try {
      const content = await readFile(entrypointPath, 'utf-8');
      if (regex) {
        if (regex.test(content)) {
          return entrypoint;
        }
      }
    } catch (_) {
      // ignore
    }
  }
  return undefined;
};

export const findEntrypointOrThrow = async (cwd: string): Promise<string> => {
  const entrypoint = await findEntrypoint(cwd);
  if (!entrypoint) {
    throw new Error(
      `No entrypoint found in "${cwd}". Expected one of: ${entrypoints.join(', ')}`
    );
  }
  return entrypoint;
};
