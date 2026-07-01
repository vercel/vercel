import {
  LocalFileSystemDetector,
  detectFrameworkRecord,
  detectFrameworks,
} from '@vercel/fs-detectors';
import { frameworkList } from '@vercel/frameworks';
import { debug as builderDebug } from '@vercel/build-utils';
import output from '../../output-manager';

/**
 * Emit a debug log to both the CLI output manager (visible with `--debug`) and
 * the build-utils debug channel (visible with `VERCEL_BUILDER_DEBUG=1` /
 * `VERCEL_DEBUG=1` inside the build container, where `vercel build` is invoked
 * without the `--debug` flag).
 */
function logDebug(message: string): void {
  output.debug(message);
  builderDebug(message);
}

/**
 * Whether this is the very first deployment for a project, as signalled by
 * the `VERCEL_FIRST_DEPLOYMENT` environment variable.
 */
export function isFirstDeployment(): boolean {
  const raw = process.env.VERCEL_FIRST_DEPLOYMENT;
  const result = raw === '1';
  logDebug(
    `isFirstDeployment: VERCEL_FIRST_DEPLOYMENT=${
      raw === undefined ? '<unset>' : JSON.stringify(raw)
    } -> ${result}`
  );
  return result;
}

/**
 * The framework detected on a project's first deployment.
 * Recorded in `builds.json` (see `BuildsManifest`).
 */
export interface DetectedFramework {
  slug: string;
  version?: string;
}

/**
 * On a project's first deployment, detect the framework from the source code
 * and apply it to the in-memory project settings so the current build's
 * builder detection uses it. Returns the detected framework, or `null` if
 * nothing was detected or detection did not run.
 *
 * The result is surfaced in `builds.json` (see `BuildsManifest`).
 */
export async function detectFirstDeploymentFramework(options: {
  workPath: string;
  projectSettings: { framework?: string | null };
}): Promise<DetectedFramework | null> {
  const { workPath, projectSettings } = options;

  logDebug(
    `First deployment: evaluating framework detection (workPath="${workPath}", ` +
      `configuredFramework=${
        projectSettings.framework ? `"${projectSettings.framework}"` : '<none>'
      })`
  );

  // Disambiguate the two skip conditions so it is clear in logs why the
  // first-deployment path did not run.
  if (!isFirstDeployment()) {
    logDebug(
      'First deployment: skipping framework detection because this is not a first deployment'
    );
    return null;
  }

  if (projectSettings.framework) {
    logDebug(
      `First deployment: skipping framework detection because a framework is already configured ("${projectSettings.framework}")`
    );
    return null;
  }

  logDebug(
    `First deployment: no framework configured; detecting from source at "${workPath}"`
  );

  const detected = await detectFrameworkRecord({
    fs: new LocalFileSystemDetector(workPath),
    frameworkList,
  });

  if (!detected || !detected.slug) {
    logDebug('First deployment: no framework detected from source code');
    return null;
  }

  const { slug } = detected;

  // Mutate in-memory so the current build uses the detected framework.
  projectSettings.framework = slug;
  logDebug(
    `First deployment: detected framework "${slug}"${
      detected.detectedVersion ? ` (version ${detected.detectedVersion})` : ''
    }; applied to project settings for this build`
  );

  return {
    slug,
    ...(detected.detectedVersion && { version: detected.detectedVersion }),
  };
}

/**
 * Detect all frameworks that match the source code at `workPath`, returning
 * their slugs.
 */
export async function detectAllFrameworks(workPath: string): Promise<string[]> {
  logDebug(`Framework cross-check: detecting frameworks at "${workPath}"`);
  const frameworks = await detectFrameworks({
    fs: new LocalFileSystemDetector(workPath),
    frameworkList,
  });
  const slugs = frameworks
    .map(f => f.slug)
    .filter((slug): slug is string => Boolean(slug));
  logDebug(`Framework cross-check: detected [${slugs.join(', ') || '<none>'}]`);
  return slugs;
}

/**
 * Whether a framework's detectors provide a high-confidence signal.
 *
 * Frameworks detected purely by file *existence* (no `matchPackage` or
 * `matchContent`) are low confidence: files like `server.js`, `_config.yml`,
 * `requirements.txt`, `Gemfile`, `go.mod`, or `bun.lock` commonly appear in
 * intentionally-static projects without implying the framework is in use.
 * Low-confidence detections may confirm a match but never drive a warning.
 */
function isHighConfidenceDetection(slug: string): boolean {
  const record = frameworkList.find(f => f.slug === slug);
  const detectors = record?.detectors;
  if (!detectors) {
    return false;
  }
  const items = [...(detectors.every ?? []), ...(detectors.some ?? [])];
  return items.some(item => item.matchPackage || item.matchContent);
}

/**
 * Warn the user when the frameworks detected from the source code do not
 * match how the project was actually built.
 *
 * Two cases are covered:
 * - A framework is configured but is not among the detected frameworks.
 * - No framework is configured, frameworks were detected, but none of their
 *   builders (or framework-tagged builds) were used by the build — e.g. the
 *   source looks like Hono but everything fell back to `@vercel/static`.
 *
 * Warnings are conservative: only high-confidence detections (see
 * `isHighConfidenceDetection`) with a checkable runtime builder can trigger
 * the "unused" warning, so intentionally-static projects that happen to
 * contain files like `server.js` or `requirements.txt` stay quiet.
 */
export type FrameworkMismatchResult =
  | 'none-detected'
  | 'match'
  | 'low-confidence'
  | 'configured-mismatch'
  | 'unused-mismatch';

export function warnIfFrameworkMismatch(options: {
  configuredFramework: string | null | undefined;
  detectedFrameworks: string[];
  /** `use` values of the builders that ran (e.g. `@vercel/static`). */
  usedBuilders?: string[];
  /** `config.framework` values of the builders that ran. */
  usedFrameworks?: (string | null | undefined)[];
}): FrameworkMismatchResult {
  const {
    configuredFramework,
    detectedFrameworks,
    usedBuilders = [],
    usedFrameworks = [],
  } = options;

  if (detectedFrameworks.length === 0) {
    logDebug(
      'Framework cross-check: nothing detected from source; skipping validation'
    );
    return 'none-detected';
  }

  // Only high-confidence detections may drive a warning. Low-confidence
  // (path-existence-only) detections like `node` via `server.js` or `jekyll`
  // via `_config.yml` are common in intentionally-static projects.
  const confidentFrameworks = detectedFrameworks.filter(
    isHighConfidenceDetection
  );

  if (configuredFramework) {
    if (detectedFrameworks.includes(configuredFramework)) {
      logDebug(
        `Framework cross-check: configured framework "${configuredFramework}" matches detected frameworks; no mismatch`
      );
      return 'match';
    }

    if (confidentFrameworks.length === 0) {
      logDebug(
        `Framework cross-check: configured framework "${configuredFramework}" not among detected [${detectedFrameworks.join(
          ', '
        )}], but all detections are low-confidence; skipping warning`
      );
      return 'low-confidence';
    }

    logDebug(
      `Framework cross-check: configured framework "${configuredFramework}" not among detected [${confidentFrameworks.join(
        ', '
      )}]; warning`
    );
    output.warn(
      `Your project is configured to use the "${configuredFramework}" framework, but the source code looks like it's for: ${confidentFrameworks.join(
        ', '
      )}. This may be a misconfiguration.`,
      null,
      'https://vercel.com/docs/project-configuration',
      'Learn More'
    );
    return 'configured-mismatch';
  }

  // No framework configured. Check whether the build actually used any of
  // the detected frameworks, either via a framework-tagged build config or
  // via the framework's dedicated runtime builder.
  const buildUsedDetectedFramework = detectedFrameworks.some(slug => {
    if (usedFrameworks.includes(slug)) {
      return true;
    }
    const record = frameworkList.find(f => f.slug === slug);
    const expectedBuilder = record?.useRuntime?.use;
    if (!expectedBuilder) {
      return false;
    }
    return usedBuilders.some(
      use => use === expectedBuilder || use.startsWith(`${expectedBuilder}@`)
    );
  });

  if (buildUsedDetectedFramework) {
    logDebug(
      `Framework cross-check: no framework configured, but the build used one of the detected frameworks [${detectedFrameworks.join(
        ', '
      )}]; no mismatch`
    );
    return 'match';
  }

  // Only warn about frameworks whose usage we can actually verify: a
  // high-confidence detection with a dedicated runtime builder. Frameworks
  // without a `useRuntime` (static-build frameworks like Hugo or Astro) are
  // legitimately built by `@vercel/static-build` without a framework tag, so
  // their absence from the used builders proves nothing.
  const warnableFrameworks = confidentFrameworks.filter(slug => {
    const record = frameworkList.find(f => f.slug === slug);
    return Boolean(record?.useRuntime?.use);
  });

  if (warnableFrameworks.length === 0) {
    logDebug(
      `Framework cross-check: no framework configured and detections [${detectedFrameworks.join(
        ', '
      )}] are low-confidence or have no dedicated runtime builder; skipping warning`
    );
    return 'low-confidence';
  }

  logDebug(
    `Framework cross-check: no framework configured and the build did not use any of the detected frameworks [${warnableFrameworks.join(
      ', '
    )}] (used builders: [${usedBuilders.join(', ') || '<none>'}]); warning`
  );
  output.warn(
    `The source code looks like it's for: ${warnableFrameworks.join(
      ', '
    )}, but no framework is configured for this project and the build did not use ${
      warnableFrameworks.length === 1 ? 'its builder' : 'their builders'
    }. Set the framework in your Project Settings if this is unexpected.`,
    null,
    'https://vercel.com/docs/project-configuration',
    'Learn More'
  );
  return 'unused-mismatch';
}
