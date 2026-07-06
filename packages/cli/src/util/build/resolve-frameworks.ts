import XDGAppPaths from 'xdg-app-paths';
import { NowBuildError } from '@vercel/build-utils';
import {
  resolveFrameworks,
  type Framework,
  type ResolvedFrameworkList,
  type StaleFrameworkEntry,
} from '@vercel/frameworks';
import {
  detectFrameworks,
  type DetectorFilesystem,
} from '@vercel/fs-detectors';
import output from '../../output-manager';
import { getCommandName } from '../pkg-name';
import cliPkg from '../pkg';

let resolved: Promise<ResolvedFrameworkList> | undefined;

/**
 * Resolves the framework preset list for this CLI invocation, preferring
 * the remote manifest (cached for 24h) over the pinned list. Memoized for
 * the lifetime of the process. Pass `requiresUpdate` from the result to
 * {@link checkStaleFrameworks}.
 */
export function getResolvedFrameworks(): Promise<ResolvedFrameworkList> {
  if (!resolved) {
    resolved = resolveFrameworks({
      cacheDir: XDGAppPaths('com.vercel.cli').cache(),
      cliVersion: cliPkg.version,
    }).then(result => {
      output.debug(
        `Resolved ${result.frameworks.length} framework presets from "${result.source}" manifest` +
          (result.requiresUpdate.length > 0
            ? ` (${result.requiresUpdate.length} require a newer CLI)`
            : '')
      );
      return result;
    });
  }
  return resolved;
}

/** For tests. */
export function resetResolvedFrameworks(): void {
  resolved = undefined;
}

/**
 * Checks whether the project matches a preset this CLI version cannot
 * build. Matches produce an upgrade warning and the build continues —
 * unless the preset is marked `failOnStale`, in which case the build is
 * aborted (a fallback build would be incorrect, e.g. `Dockerfile.vercel`).
 */
export async function checkStaleFrameworks(
  fs: DetectorFilesystem,
  requiresUpdate: readonly StaleFrameworkEntry[]
): Promise<void> {
  if (requiresUpdate.length === 0) {
    return;
  }

  // Detection only consults `slug` and `detectors`, which stale entries
  // still carry — only their build behavior cannot be interpreted.
  const detectable = requiresUpdate.filter(s => s.entry.detectors);
  if (detectable.length === 0) {
    return;
  }

  const matches = await detectFrameworks({
    fs,
    frameworkList: detectable.map(s => s.entry) as unknown as Framework[],
  });
  if (matches.length === 0) {
    return;
  }

  const matchedEntries = matches.map(
    m => detectable.find(s => s.entry.slug === m.slug)!
  );

  const hardFailure = matchedEntries.find(s => s.entry.failOnStale);
  if (hardFailure) {
    throw new NowBuildError({
      code: 'cli_update_required',
      message:
        `Detected "${hardFailure.entry.name}" but this version of Vercel CLI cannot build it. ` +
        `Run ${getCommandName('upgrade')} to update, then try again.`,
      link: 'https://vercel.com/docs/cli',
      action: 'Update Vercel CLI',
    });
  }

  for (const { entry } of matchedEntries) {
    output.warn(
      `Detected "${entry.name}" but an update to Vercel CLI is required to build with it. ` +
        `Run ${getCommandName('upgrade')} to update. Continuing with the best available preset.`
    );
  }
}
