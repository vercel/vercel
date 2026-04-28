import minimatch from 'minimatch';
import type { Framework, FrameworkDetectionItem } from '@vercel/frameworks';
import { normalizePath } from '@vercel/build-utils';
import { spawnSync } from 'child_process';
import { DetectorFilesystem } from './detectors/filesystem';

interface BaseFramework {
  slug: Framework['slug'];
  detectors?: Framework['detectors'];
}

export interface DetectFrameworkOptions {
  fs: DetectorFilesystem;
  frameworkList: readonly BaseFramework[];
  /**
   * When true, includes experimental frameworks in detection.
   * If undefined, falls back to VERCEL_USE_EXPERIMENTAL_FRAMEWORKS env var.
   * Defaults to false if neither is set.
   */
  useExperimentalFrameworks?: boolean;
}

export interface DetectFrameworkRecordOptions {
  fs: DetectorFilesystem;
  frameworkList: readonly Framework[];
  /**
   * When true, includes experimental frameworks in detection.
   * If undefined, falls back to VERCEL_USE_EXPERIMENTAL_FRAMEWORKS env var.
   * Defaults to false if neither is set.
   */
  useExperimentalFrameworks?: boolean;
}

type MatchResult = {
  framework: BaseFramework;
  detectedVersion?: string;
};

function hasGlobMagic(path: string): boolean {
  return /[*?[\]{}()!+@]/.test(path);
}

function normalizeDetectorPath(path: string): string {
  return normalizePath(path).replace(/^\/+/, '').replace(/^\.\//, '');
}

async function listPaths(
  fs: DetectorFilesystem,
  dirPath = '/'
): Promise<string[]> {
  const entries = await fs.readdir(dirPath);
  const nestedPaths = await Promise.all(
    entries
      .filter(entry => entry.type === 'dir')
      .map(entry => listPaths(fs, entry.path))
  );

  return [...entries.map(entry => entry.path), ...nestedPaths.flat()];
}

async function getMatchingPaths(
  fs: DetectorFilesystem,
  path: string
): Promise<string[]> {
  if (!hasGlobMagic(path)) {
    return (await fs.hasPath(path)) ? [path] : [];
  }

  const normalizedPattern = normalizeDetectorPath(path);
  return (await listPaths(fs)).filter(filePath => {
    const normalizedFilePath = normalizeDetectorPath(filePath);
    return minimatch(normalizedFilePath, normalizedPattern, { dot: true });
  });
}

/**
 * Resolves whether experimental frameworks should be included.
 * Priority: explicit option > env var > false
 */
function shouldIncludeExperimentalFrameworks(
  useExperimentalFrameworks?: boolean
): boolean {
  if (typeof useExperimentalFrameworks === 'boolean') {
    return useExperimentalFrameworks;
  }
  const experimentalEnv = process.env.VERCEL_USE_EXPERIMENTAL_FRAMEWORKS;
  const isEnabled = (val?: string) =>
    val === '1' || (typeof val === 'string' && val.toLowerCase() === 'true');

  return isEnabled(experimentalEnv);
}

/**
 * Filters out experimental frameworks unless explicitly opted in.
 */
function filterFrameworkList<T extends BaseFramework>(
  frameworkList: readonly T[],
  useExperimentalFrameworks?: boolean
): readonly T[] {
  if (shouldIncludeExperimentalFrameworks(useExperimentalFrameworks)) {
    return frameworkList;
  }
  return frameworkList.filter(f => {
    // Check if framework has experimental property and filter it out if true
    const experimental = (f as { experimental?: boolean }).experimental;
    return !experimental;
  });
}

async function matches(
  fs: DetectorFilesystem,
  framework: BaseFramework
): Promise<MatchResult | undefined> {
  const { detectors } = framework;

  if (!detectors) {
    return;
  }

  const { every, some } = detectors;

  if (every !== undefined && !Array.isArray(every)) {
    return;
  }

  if (some !== undefined && !Array.isArray(some)) {
    return;
  }

  const check = async ({
    path,
    matchContent,
    matchPackage,
  }: FrameworkDetectionItem): Promise<MatchResult | undefined> => {
    if (matchPackage && matchContent) {
      throw new Error(
        `Cannot specify "matchPackage" and "matchContent" in the same detector for "${framework.slug}"`
      );
    }
    if (matchPackage && path) {
      throw new Error(
        `Cannot specify "matchPackage" and "path" in the same detector for "${framework.slug}" because "path" is assumed to be "package.json".`
      );
    }

    if (!path && !matchPackage) {
      throw new Error(
        `Must specify either "path" or "matchPackage" in detector for "${framework.slug}".`
      );
    }

    if (!path) {
      path = 'package.json';
    }

    if (matchPackage) {
      matchContent = `"(dev)?(d|D)ependencies":\\s*{[^}]*"${matchPackage}":\\s*"(.+?)"[^}]*}`;
    }

    const matchingPaths = await getMatchingPaths(fs, path);
    if (matchingPaths.length === 0) {
      return;
    }

    if (matchContent) {
      const regex = new RegExp(matchContent, 'm');

      for (const matchingPath of matchingPaths) {
        if ((await fs.isFile(matchingPath)) === false) {
          continue;
        }

        const content = await fs.readFile(matchingPath);
        const match = content.toString().match(regex);
        if (!match) {
          continue;
        }

        if (matchPackage && match[3]) {
          return {
            framework,
            detectedVersion: match[3],
          };
        }

        return {
          framework,
        };
      }

      return;
    }

    return {
      framework,
    };
  };

  const result: (MatchResult | undefined)[] = [];

  if (every) {
    const everyResult = await Promise.all(every.map(item => check(item)));
    result.push(...everyResult);
  }

  if (some) {
    let someResult: MatchResult | undefined;

    for (const item of some) {
      const itemResult = await check(item);
      if (itemResult) {
        someResult = itemResult;
        break;
      }
    }

    result.push(someResult);
  }

  if (!result.every(res => !!res)) {
    return;
  }

  const detectedVersion = result.find(
    r => typeof r === 'object' && r.detectedVersion
  )?.detectedVersion;
  return {
    framework,
    detectedVersion,
  };
}

function removeSupersededFramework(
  matches: (Pick<Framework, 'supersedes' | 'slug'> | null)[],
  slug: string
) {
  const index = matches.findIndex(f => f?.slug === slug);
  const framework = matches[index];
  if (framework) {
    if (framework.supersedes) {
      for (const slug of framework.supersedes) {
        removeSupersededFramework(matches, slug);
      }
    }
    matches.splice(index, 1);
  }
}

export function removeSupersededFrameworks(
  matches: (Pick<Framework, 'supersedes' | 'slug'> | null)[]
) {
  for (const match of matches.slice()) {
    if (match?.supersedes) {
      for (const slug of match.supersedes) {
        removeSupersededFramework(matches, slug);
      }
    }
  }
}

// TODO: Deprecate and replace with `detectFrameworkRecord`
export async function detectFramework({
  fs,
  frameworkList,
  useExperimentalFrameworks,
}: DetectFrameworkOptions): Promise<string | null> {
  const filteredList = filterFrameworkList(
    frameworkList,
    useExperimentalFrameworks
  );
  const result = await Promise.all(
    filteredList.map(async frameworkMatch => {
      if (await matches(fs, frameworkMatch)) {
        return frameworkMatch;
      }
      return null;
    })
  );
  removeSupersededFrameworks(result);
  return result.find(res => res !== null)?.slug ?? null;
}

/**
 * Detects all matching Frameworks based on the given virtual filesystem.
 */
export async function detectFrameworks({
  fs,
  frameworkList,
  useExperimentalFrameworks,
}: DetectFrameworkRecordOptions): Promise<Framework[]> {
  const filteredList = filterFrameworkList(
    frameworkList,
    useExperimentalFrameworks
  );
  const result = await Promise.all(
    filteredList.map(async frameworkMatch => {
      if (await matches(fs, frameworkMatch)) {
        return frameworkMatch;
      }
      return null;
    })
  );
  removeSupersededFrameworks(result);
  return result.filter(res => res !== null) as Framework[];
}

/**
 * Framework with a `detectedVersion` specifying the version
 * or version range of the relevant package
 */
type VersionedFramework = Framework & {
  detectedVersion?: string;
};

// Note: Does not currently support a `frameworkList` of monorepo managers
export async function detectFrameworkRecord({
  fs,
  frameworkList,
  useExperimentalFrameworks,
}: DetectFrameworkRecordOptions): Promise<VersionedFramework | null> {
  const filteredList = filterFrameworkList(
    frameworkList,
    useExperimentalFrameworks
  );
  const result = await Promise.all(
    filteredList.map(async frameworkMatch => {
      const matchResult = await matches(fs, frameworkMatch);
      if (matchResult) {
        return {
          ...frameworkMatch,
          detectedVersion: matchResult?.detectedVersion,
        };
      }
      return null;
    })
  );
  removeSupersededFrameworks(result);
  return result.find(res => res !== null) ?? null;
}

export function detectFrameworkVersion(
  frameworkRecord: Framework
): string | undefined {
  const allDetectors = [
    ...(frameworkRecord.detectors?.every || []),
    ...(frameworkRecord.detectors?.some || []),
  ];
  const firstMatchPackage = allDetectors.find(d => d.matchPackage);

  if (!firstMatchPackage?.matchPackage) {
    return;
  }

  return lookupInstalledVersion(
    process.execPath,
    firstMatchPackage.matchPackage
  );
}

function lookupInstalledVersion(
  cwd: string,
  packageName: string
): string | undefined {
  try {
    const script = `require('${packageName}/package.json').version`;
    return spawnSync(cwd, ['-p', script], {
      encoding: 'utf-8',
    }).stdout.trim();
  } catch (error) {
    console.debug(
      `Error looking up version of installed package "${packageName}": ${error}`
    );
  }

  return;
}
