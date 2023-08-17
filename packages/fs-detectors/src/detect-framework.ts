import type { Framework, FrameworkDetectionItem } from '@vercel/frameworks';
import { spawnSync } from 'child_process';
import { DetectorFilesystem } from './detectors/filesystem';

interface BaseFramework {
  slug: Framework['slug'];
  detectors?: Framework['detectors'];
}

export interface DetectFrameworkOptions {
  fs: DetectorFilesystem;
  frameworkList: readonly BaseFramework[];
}

export interface DetectFrameworkRecordOptions {
  fs: DetectorFilesystem;
  frameworkList: readonly Framework[];
}

type MatchResult = {
  framework: BaseFramework;
  detectedVersion?: string;
};

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

function removeSupercededFramework(
  matches: (Pick<Framework, 'supersedes' | 'slug'> | null)[],
  slug: string
) {
  const index = matches.findIndex(f => f?.slug === slug);
  if (index !== -1) {
    const framework = matches[index]!;
    if (framework.supersedes) {
      removeSupercededFramework(matches, framework.supersedes);
    }
    matches.splice(index, 1);
  }
}

export function removeSupercededFrameworks(
  matches: (Pick<Framework, 'supersedes' | 'slug'> | null)[]
) {
  for (const match of matches.slice()) {
    if (!match) continue;
    if (match.supersedes) {
      removeSupercededFramework(matches, match.supersedes);
    }
  }
}

// TODO: Deprecate and replace with `detectFrameworkRecord`
export async function detectFramework({
  fs,
  frameworkList,
}: DetectFrameworkOptions): Promise<string | null> {
  const result = await Promise.all(
    frameworkList.map(async frameworkMatch => {
      if (await matches(fs, frameworkMatch)) {
        return frameworkMatch;
      }
      return null;
    })
  );
  removeSupercededFrameworks(result);
  return result.find(res => res !== null)?.slug ?? null;
}

/**
 * Detects all matching Frameworks based on the given virtual filesystem.
 */
export async function detectFrameworks({
  fs,
  frameworkList,
}: DetectFrameworkRecordOptions): Promise<Framework[]> {
  const result = await Promise.all(
    frameworkList.map(async frameworkMatch => {
      if (await matches(fs, frameworkMatch)) {
        return frameworkMatch;
      }
      return null;
    })
  );
  removeSupercededFrameworks(result);
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
}: DetectFrameworkRecordOptions): Promise<VersionedFramework | null> {
  const result = await Promise.all(
    frameworkList.map(async frameworkMatch => {
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
  removeSupercededFrameworks(result);
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
