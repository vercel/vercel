import { relative, resolve, sep } from 'node:path';
import {
  createEntrypointDetectorFs,
  type DetectEntrypointFn,
  type EntrypointDetectorFilesystem,
} from '@vercel/build-utils';

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
  cwd: string,
  fs?: EntrypointDetectorFilesystem
): Promise<string | undefined> => {
  const dfs = fs ?? createEntrypointDetectorFs(cwd);

  let packageJsonObject: {
    main?: string;
    dependencies?: Record<string, string>;
  } | null = null;
  try {
    const buf = await dfs.readFile('package.json');
    packageJsonObject = JSON.parse(buf.toString('utf-8'));
  } catch (_) {
    // ignore
  }

  if (packageJsonObject) {
    const main =
      typeof packageJsonObject.main === 'string'
        ? packageJsonObject.main.trim()
        : '';
    if (main) {
      const rel = relative(cwd, resolve(cwd, main)).split(sep).join('/');
      if (!rel.startsWith('..') && rel !== '') {
        try {
          await dfs.readFile(rel);
          return rel;
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
      try {
        await dfs.readFile(entrypoint);
        return entrypoint;
      } catch (_) {
        // ignore
      }
    }
  }

  const regex = framework ? createFrameworkRegex(framework) : undefined;

  for (const entrypoint of entrypoints) {
    try {
      const buf = await dfs.readFile(entrypoint);
      if (regex) {
        if (regex.test(buf.toString('utf-8'))) {
          return entrypoint;
        }
      }
    } catch (_) {
      // ignore
    }
  }
  return undefined;
};

export const findEntrypointOrThrow = async (
  cwd: string,
  fs?: EntrypointDetectorFilesystem
): Promise<string> => {
  const entrypoint = await findEntrypoint(cwd, fs);
  if (!entrypoint) {
    throw new Error(
      `No entrypoint found in "${cwd}". Set package.json "main" to a server file, or add one of: ${entrypoints.join(', ')}`
    );
  }
  return entrypoint;
};

export const findEntrypointWithHintOrThrow = async (
  workPath: string,
  configured: string | undefined,
  fs?: EntrypointDetectorFilesystem
): Promise<string> => {
  const dfs = fs ?? createEntrypointDetectorFs(workPath);
  const explicit =
    configured && configured !== 'package.json' ? configured : null;
  if (explicit && (await dfs.isFile(explicit))) {
    return explicit;
  }
  return findEntrypointOrThrow(workPath, fs);
};

/**
 * Normalized entrypoint detector for Node services. Wraps {@link findEntrypoint}
 * and returns the result in the shared {@link DetectedEntrypoint} shape consumed
 * by services auto-detection.
 */
export const detectEntrypoint: DetectEntrypointFn = async ({
  workPath,
  fs,
}) => {
  const file = await findEntrypoint(workPath, fs);
  if (!file) return null;
  return { kind: 'file', entrypoint: file };
};
