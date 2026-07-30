import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { DetectEntrypointFn } from '@vercel/build-utils';

/**
 * Entrypoint detection modeled on the framework wrapper builders
 * (`@vercel/express`, `@vercel/hono`, ... — see
 * `packages/build-utils/src/generate-node-builder-functions.ts`), but
 * deliberately a *permissive union* with this builder's historical behavior
 * so that neither wrapper migrations nor existing `@vercel/backends` flag
 * users start failing:
 *
 * 1. If `outputDirectory` is configured, search there first (wrapper
 *    preference) — but fall through to the source tree instead of erroring
 *    when nothing is found (historical backends behavior: `outputDirectory`
 *    never blocked detection).
 * 2. Search well-known filenames in the project root, requiring the file to
 *    import the detected framework (wrapper behavior).
 * 3. Fall back to `package.json#main` when it points at an existing file —
 *    without requiring a framework import (historical backends behavior;
 *    the wrappers additionally gate `main` on the import, but relaxing the
 *    gate only accepts more projects, never fewer).
 *
 * When no framework dependency is recognized, the framework-import gate is
 * skipped and the first existing well-known file (or `main`) wins.
 */

const entrypointExtensions = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

/**
 * Wrapper builders search app/index/server (+src). Historical backends also
 * searched main/src/main for every framework; keep them appended so
 * existing users don't lose their entrypoint.
 */
const DEFAULT_FILENAMES = [
  'app',
  'index',
  'server',
  'src/app',
  'src/index',
  'src/server',
  'main',
  'src/main',
];

/** NestJS conventionally uses `src/main.ts`; its wrapper prefers `src/` first. */
const NESTJS_FILENAMES = [
  'src/main',
  'src/app',
  'src/index',
  'src/server',
  'main',
  'app',
  'index',
  'server',
];

/** Used when no framework dependency is recognized (historical backends order). */
const GENERIC_FILENAMES = [
  'app',
  'index',
  'server',
  'main',
  'src/app',
  'src/index',
  'src/server',
  'src/main',
];

type FrameworkSpec = {
  /** npm package whose import gates entrypoint candidates. */
  dependency: string;
  /** Name used in error messages (the wrapper builders' `frameworkName`). */
  name: string;
  filenames: string[];
};

/**
 * `@nestjs/core` is listed first: Nest apps commonly also depend on `express`
 * (via `@nestjs/platform-express`), and their entrypoints import
 * `@nestjs/core`, not `express`.
 */
const FRAMEWORKS: FrameworkSpec[] = [
  { dependency: '@nestjs/core', name: 'nestjs', filenames: NESTJS_FILENAMES },
  { dependency: 'express', name: 'express', filenames: DEFAULT_FILENAMES },
  { dependency: 'hono', name: 'hono', filenames: DEFAULT_FILENAMES },
  { dependency: 'elysia', name: 'elysia', filenames: DEFAULT_FILENAMES },
  { dependency: 'fastify', name: 'fastify', filenames: DEFAULT_FILENAMES },
  { dependency: 'koa', name: 'koa', filenames: DEFAULT_FILENAMES },
  { dependency: 'h3', name: 'h3', filenames: DEFAULT_FILENAMES },
];

const toCandidates = (filenames: string[]) =>
  filenames.flatMap(filename =>
    entrypointExtensions.map(extension => `${filename}.${extension}`)
  );

const entrypointsForMessage = (filenames: string[]) =>
  filenames
    .map(filename => `- ${filename}.{${entrypointExtensions.join(',')}}`)
    .join('\n');

const createFrameworkRegex = (dependency: string) =>
  new RegExp(
    `(?:from|require|import)\\s*(?:\\(\\s*)?["']${dependency}["']\\s*(?:\\))?`,
    'g'
  );

const pluralize = (word: string, count: number) =>
  count === 1 ? word : `${word}s`;

/** Returns true/false for readable files, null when unreadable/missing. */
const matchesFramework = async (
  absolutePath: string,
  spec: FrameworkSpec
): Promise<boolean | null> => {
  try {
    const content = await readFile(absolutePath, 'utf-8');
    return content.match(createFrameworkRegex(spec.dependency)) !== null;
  } catch {
    return null;
  }
};

type FindEntrypointOptions = {
  /**
   * Project setting `outputDirectory`. When set, the search is exclusive to
   * that directory, matching the wrapper builders.
   */
  outputDirectory?: string;
};

type Resolution =
  | { entrypoint: string; error?: undefined }
  | { entrypoint?: undefined; error: Error };

const searchDirectory = async (
  dir: string,
  framework: FrameworkSpec | undefined,
  filenames: string[]
): Promise<{
  entrypoint: string | undefined;
  entrypointsNotMatchingRegex: string[];
}> => {
  const existing = toCandidates(filenames).filter(candidate =>
    existsSync(join(dir, candidate))
  );

  if (!framework) {
    return { entrypoint: existing[0], entrypointsNotMatchingRegex: [] };
  }

  const matching: string[] = [];
  const entrypointsNotMatchingRegex: string[] = [];
  for (const candidate of existing) {
    const matches = await matchesFramework(join(dir, candidate), framework);
    if (matches === true) {
      matching.push(candidate);
    } else if (matches === false) {
      entrypointsNotMatchingRegex.push(candidate);
    }
  }

  const entrypoint = matching[0];
  if (matching.length > 1) {
    console.warn(
      `Multiple entrypoints found: ${matching.join(', ')}. Using ${entrypoint}.`
    );
  }
  return { entrypoint, entrypointsNotMatchingRegex };
};

const findMainEntrypoint = async (
  cwd: string,
  packageJsonObject: { main?: unknown } | null
): Promise<string | undefined> => {
  const main =
    packageJsonObject && typeof packageJsonObject.main === 'string'
      ? packageJsonObject.main.trim()
      : '';
  if (!main) return undefined;

  const abs = resolve(cwd, main);
  const rel = relative(cwd, abs);
  if (rel.startsWith('..') || rel === '') return undefined;
  if (!existsSync(abs)) return undefined;

  // Historical backends behavior: accept `main` whenever it points at a
  // readable file, without requiring a framework import. (The wrapper
  // builders gate `main` on the framework regex; skipping that gate only
  // accepts more projects.)
  try {
    await readFile(abs, 'utf-8');
  } catch {
    return undefined;
  }
  return rel.split(sep).join('/');
};

const resolveEntrypoint = async (
  cwd: string,
  options?: FindEntrypointOptions
): Promise<Resolution> => {
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

  const framework = packageJsonObject
    ? FRAMEWORKS.find(
        spec => packageJsonObject!.dependencies?.[spec.dependency]
      )
    : undefined;
  const filenames = framework ? framework.filenames : GENERIC_FILENAMES;
  const searchedForMessage = entrypointsForMessage(filenames);

  // Match the wrapper builders' errors verbatim (including the trailing
  // space quirk in the output-directory variant).
  const noMatchingImportError = (candidates: string[]) =>
    new Error(
      `No entrypoint found which imports ${framework!.name}. Found possible ${pluralize('entrypoint', candidates.length)}: ${candidates.join(', ')}`
    );

  // Prefer the configured output directory (wrapper behavior), but fall
  // through to the source tree instead of erroring when nothing is found —
  // historical backends never let `outputDirectory` block detection, and a
  // shared static/server project may keep only client assets there.
  const dir = options?.outputDirectory?.replace(/^\/+|\/+$/g, '');
  if (dir) {
    const { entrypoint: outputDirEntrypoint } = await searchDirectory(
      join(cwd, dir),
      framework,
      filenames
    );
    if (outputDirEntrypoint) {
      return {
        entrypoint: join(dir, outputDirEntrypoint).split(sep).join('/'),
      };
    }
  }

  const { entrypoint, entrypointsNotMatchingRegex } = await searchDirectory(
    cwd,
    framework,
    filenames
  );
  if (entrypoint) {
    return { entrypoint };
  }

  const mainEntrypoint = await findMainEntrypoint(cwd, packageJsonObject);
  if (mainEntrypoint) {
    return { entrypoint: mainEntrypoint };
  }

  if (framework && entrypointsNotMatchingRegex.length > 0) {
    return { error: noMatchingImportError(entrypointsNotMatchingRegex) };
  }
  if (framework) {
    return {
      error: new Error(
        `No entrypoint found. Searched for:\n${searchedForMessage}`
      ),
    };
  }
  return {
    error: new Error(
      `No entrypoint found in "${cwd}". Set package.json "main" to a server file, or add one of: ${toCandidates(filenames).join(', ')}`
    ),
  };
};

export const findEntrypoint = async (
  cwd: string,
  options?: FindEntrypointOptions
): Promise<string | undefined> => {
  const result = await resolveEntrypoint(cwd, options);
  return result.entrypoint;
};

export const findEntrypointOrThrow = async (
  cwd: string,
  options?: FindEntrypointOptions
): Promise<string> => {
  const result = await resolveEntrypoint(cwd, options);
  if (result.error) {
    throw result.error;
  }
  return result.entrypoint;
};

export const findEntrypointWithHintOrThrow = async (
  workPath: string,
  configured: string | undefined,
  options?: FindEntrypointOptions
): Promise<string> => {
  const explicit =
    configured && configured !== 'package.json' ? configured : null;
  if (explicit && existsSync(join(workPath, explicit))) {
    return explicit;
  }
  return findEntrypointOrThrow(workPath, options);
};

/**
 * Normalized entrypoint detector for Node services. Wraps {@link findEntrypoint}
 * and returns the result in the shared {@link DetectedEntrypoint} shape consumed
 * by services auto-detection.
 */
export const detectEntrypoint: DetectEntrypointFn = async ({ workPath }) => {
  const file = await findEntrypoint(workPath);
  if (!file) return null;
  return { kind: 'file', entrypoint: file };
};
