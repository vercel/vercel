import { getNodeExecPath } from '@vercel/build-utils';
import type { Framework, FrameworkDetectionItem } from '@vercel/frameworks';
import { spawnSync } from 'child_process';
import { DetectorFilesystem } from './detectors/filesystem';
import { toBuildpackRuntime } from './buildpack-runtimes';

interface BaseFramework {
  slug: Framework['slug'];
  detectors?: Framework['detectors'];
  supersedes?: Framework['supersedes'];
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
  fallback: boolean;
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
 */
function filterFrameworkList<T extends BaseFramework>(
  frameworkList: readonly T[],
  useExperimentalFrameworks?: boolean
): readonly T[] {
  if (shouldIncludeExperimentalFrameworks(useExperimentalFrameworks)) {
    return frameworkList;
  }
  return frameworkList.filter(f => {
    const experimental = (f as { experimental?: boolean }).experimental;
    if (!experimental) {
      return true;
    }
    // Buildpack-backed runtime frameworks are enabled by their own
    // flag and do not require experimental frameworks to be enabled.
    return toBuildpackRuntime(f.slug) !== undefined;
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
    fallback = false,
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
          fallback,
        };
      }
    }

    return {
      framework,
      fallback,
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
    fallback: result.some(match => match?.fallback),
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

function orderFrameworkMatches<T extends BaseFramework>(
  matches: Array<(MatchResult & { framework: T }) | null>
): Array<MatchResult & { framework: T }> {
  const normalMatches = matches.filter(
    (match): match is MatchResult & { framework: T } =>
      Boolean(match && !match.fallback)
  );
  const fallbackMatches = matches.filter(
    (match): match is MatchResult & { framework: T } => Boolean(match?.fallback)
  );

  const normalFrameworks = normalMatches.map(match => match.framework);
  removeSupersededFrameworks(normalFrameworks);

  const fallbackFrameworks = fallbackMatches.map(match => match.framework);
  for (const framework of normalFrameworks) {
    for (const slug of framework.supersedes ?? []) {
      removeSupersededFramework(fallbackFrameworks, slug);
    }
  }
  removeSupersededFrameworks(fallbackFrameworks);

  return [
    ...normalMatches.filter(match =>
      normalFrameworks.includes(match.framework)
    ),
    ...fallbackMatches.filter(match =>
      fallbackFrameworks.includes(match.framework)
    ),
  ];
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
    filteredList.map(async framework => {
      const match = await matches(fs, framework);
      return match ? { ...match, framework } : null;
    })
  );
  return orderFrameworkMatches(result)[0]?.framework.slug ?? null;
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
    filteredList.map(async framework => {
      const match = await matches(fs, framework);
      return match ? { ...match, framework } : null;
    })
  );
  return orderFrameworkMatches(result).map(match => match.framework);
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
    filteredList.map(async framework => {
      const match = await matches(fs, framework);
      return match ? { ...match, framework } : null;
    })
  );
  const match = orderFrameworkMatches(result)[0];
  return match
    ? { ...match.framework, detectedVersion: match.detectedVersion }
    : null;
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

  return lookupInstalledVersion(firstMatchPackage.matchPackage);
}

function lookupInstalledVersion(packageName: string): string | undefined {
  try {
    const script = `require('${packageName}/package.json').version`;
    return spawnSync(getNodeExecPath(), ['-p', script], {
      encoding: 'utf-8',
    }).stdout.trim();
  } catch (error) {
    console.debug(
      `Error looking up version of installed package "${packageName}": ${error}`
    );
  }

  return;
}
