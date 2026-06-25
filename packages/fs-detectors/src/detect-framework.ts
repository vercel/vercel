import type { Framework, FrameworkDetectionItem } from '@vercel/frameworks';
import { spawnSync } from 'child_process';
import { DetectorFilesystem } from './detectors/filesystem';

interface BaseFramework {
  slug: Framework['slug'];
  detectors?: Framework['detectors'];
}

/**
 * Per-framework opt-in for experimental presets, keyed by framework slug.
 *
 * Resolved remotely by the caller (e.g. the CLI fetches and caches this) and
 * passed in, so this package stays free of any network/auth dependency. A
 * value of `true` for a slug includes that experimental framework in detection
 * even when `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS` is not set.
 *
 * Mirrors the API shape `{ overrideExperimental: { container: true } }`.
 */
export type ExperimentalOverrides = Record<string, boolean>;

export interface DetectFrameworkOptions {
  fs: DetectorFilesystem;
  frameworkList: readonly BaseFramework[];
  /**
   * When true, includes experimental frameworks in detection.
   * If undefined, falls back to VERCEL_USE_EXPERIMENTAL_FRAMEWORKS env var.
   * Defaults to false if neither is set.
   */
  useExperimentalFrameworks?: boolean;
  /**
   * Per-slug opt-in for experimental frameworks. Only consulted when
   * `useExperimentalFrameworks`/the env var has not already enabled all
   * experimental frameworks. An experimental framework whose slug maps to
   * `true` here is included in detection.
   */
  experimentalOverrides?: ExperimentalOverrides;
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
  /**
   * Per-slug opt-in for experimental frameworks. Only consulted when
   * `useExperimentalFrameworks`/the env var has not already enabled all
   * experimental frameworks. An experimental framework whose slug maps to
   * `true` here is included in detection.
   */
  experimentalOverrides?: ExperimentalOverrides;
}

type MatchResult = {
  framework: BaseFramework;
  detectedVersion?: string;
};

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
 *
 * Inclusion rules for an experimental framework, in order:
 *   1. `useExperimentalFrameworks` / `VERCEL_USE_EXPERIMENTAL_FRAMEWORKS`
 *      enables ALL experimental frameworks (today's behavior).
 *   2. Otherwise, the framework is included only if its slug is explicitly
 *      enabled via `experimentalOverrides` (e.g. the remotely-fetched
 *      `{ overrideExperimental: { container: true } }`).
 *
 * Non-experimental frameworks are always included.
 */
function filterFrameworkList<T extends BaseFramework>(
  frameworkList: readonly T[],
  useExperimentalFrameworks?: boolean,
  experimentalOverrides?: ExperimentalOverrides
): readonly T[] {
  if (shouldIncludeExperimentalFrameworks(useExperimentalFrameworks)) {
    return frameworkList;
  }
  return frameworkList.filter(f => {
    // Check if framework has experimental property and filter it out if true
    const experimental = (f as { experimental?: boolean }).experimental;
    if (!experimental) {
      return true;
    }
    // Per-slug remote opt-in (e.g. graduating a preset without a CLI upgrade).
    const slug = (f as { slug?: string | null }).slug;
    return Boolean(slug && experimentalOverrides?.[slug] === true);
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

    if ((await fs.hasPath(path)) === false) {
      return;
    }

    if (matchContent) {
      if ((await fs.isFile(path)) === false) {
        return;
      }

      const regex = new RegExp(matchContent, 'm');
      const content = await fs.readFile(path);

      const match = content.toString().match(regex);
      if (!match) {
        return;
      }
      if (matchPackage && match[3]) {
        return {
          framework,
          detectedVersion: match[3],
        };
      }
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
  experimentalOverrides,
}: DetectFrameworkOptions): Promise<string | null> {
  const filteredList = filterFrameworkList(
    frameworkList,
    useExperimentalFrameworks,
    experimentalOverrides
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
  experimentalOverrides,
}: DetectFrameworkRecordOptions): Promise<Framework[]> {
  const filteredList = filterFrameworkList(
    frameworkList,
    useExperimentalFrameworks,
    experimentalOverrides
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
  experimentalOverrides,
}: DetectFrameworkRecordOptions): Promise<VersionedFramework | null> {
  const filteredList = filterFrameworkList(
    frameworkList,
    useExperimentalFrameworks,
    experimentalOverrides
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
