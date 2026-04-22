import { readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

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
  let packageJsonObject: {
    main?: string;
    dependencies?: Record<string, string>;
  } | null = null;
  try {
    const packageJson = await readFile(join(cwd, 'package.json'), 'utf-8');
    packageJsonObject = JSON.parse(packageJson);
  } catch (_) {
    // ignore
  }

  if (packageJsonObject) {
    const main =
      typeof packageJsonObject.main === 'string'
        ? packageJsonObject.main.trim()
        : '';
    if (main) {
      const abs = resolve(cwd, main);
      const rel = relative(cwd, abs);
      if (!rel.startsWith('..') && rel !== '') {
        try {
          await readFile(abs, 'utf-8');
          return rel.split(sep).join('/');
        } catch {
          // main missing or unreadable; fall through to filename heuristics
        }
      }
    }
  }

  let framework: string | undefined;
  if (packageJsonObject) {
    framework = frameworks.find(
      framework => packageJsonObject!.dependencies?.[framework]
    );
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
      `No entrypoint found in "${cwd}". Set package.json "main" to a server file, or add one of: ${entrypoints.join(', ')}`
    );
  }
  return entrypoint;
};
