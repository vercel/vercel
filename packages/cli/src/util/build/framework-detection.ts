import {
  LocalFileSystemDetector,
  detectFrameworkRecord,
  detectFrameworks,
} from '@vercel/fs-detectors';
import { frameworkList } from '@vercel/frameworks';
import { debug as builderDebug } from '@vercel/build-utils';
import output from '../../output-manager';

/**
 * Emit a debug log to both the CLI output manager (visible with `--debug`)
 * and the build-utils debug channel (visible with `VERCEL_BUILDER_DEBUG=1`).
 */
function logDebug(message: string): void {
  output.debug(message);
  builderDebug(message);
}

/**
 * Build-time framework detection is opt-in via `VERCEL_FRAMEWORK_DETECTION=1`.
 * The variable is set by the Vercel build pipeline (to control rollout) and
 * can also be set manually, e.g. in project build env vars or locally when
 * running `vc build`.
 */
export function isFrameworkDetectionEnabled(): boolean {
  const raw = process.env.VERCEL_FRAMEWORK_DETECTION;
  const enabled = raw === '1';
  logDebug(
    `Framework detection: VERCEL_FRAMEWORK_DETECTION=${
      raw === undefined ? '<unset>' : JSON.stringify(raw)
    } -> ${enabled ? 'enabled' : 'disabled'}`
  );
  return enabled;
}

/**
 * Whether this is the very first deployment for a project, as signalled by
 * the `VERCEL_FIRST_DEPLOYMENT` environment variable. The Vercel deployment
 * pipeline sets it when a deployment is created for a brand-new project.
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
 * Result of first-deployment framework detection, recorded in `builds.json`
 * (see `BuildsManifest`). Always includes a `status` so consumers can tell
 * the difference between "detected", "nothing detected", and "did not run".
 */
export interface DetectedFramework {
  status: 'detected' | 'not-detected' | 'skipped';
  slug?: string;
  version?: string;
}

/**
 * On a project's first deployment, detect the framework from the source code
 * and apply it to the in-memory `projectSettings` (mutated in place so the
 * caller's subsequent `detectBuilders` call sees it).
 */
export async function detectFirstDeploymentFramework(options: {
  workPath: string;
  projectSettings: { framework?: string | null };
}): Promise<DetectedFramework> {
  const { workPath, projectSettings } = options;

  if (!isFrameworkDetectionEnabled()) {
    return { status: 'skipped' };
  }

  logDebug(
    `First deployment: evaluating framework detection (workPath="${workPath}", ` +
      `configuredFramework=${
        projectSettings.framework ? `"${projectSettings.framework}"` : '<none>'
      })`
  );

  if (!isFirstDeployment()) {
    logDebug(
      'First deployment: skipping framework detection because this is not a first deployment'
    );
    return { status: 'skipped' };
  }

  if (projectSettings.framework) {
    logDebug(
      `First deployment: skipping framework detection because a framework is already configured ("${projectSettings.framework}")`
    );
    return { status: 'skipped' };
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
    return { status: 'not-detected' };
  }

  const { slug } = detected;

  // Applied in place so the caller's `detectBuilders` sees the framework.
  projectSettings.framework = slug;
  logDebug(
    `First deployment: detected framework "${slug}"${
      detected.detectedVersion ? ` (version ${detected.detectedVersion})` : ''
    }; applied to project settings for this build`
  );

  return {
    status: 'detected',
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
 * Frameworks annotated with `detectionConfidence: 'weak'` may confirm a
 * match but never trigger a warning on their own.
 */
function isHighConfidenceDetection(slug: string): boolean {
  const record = frameworkList.find(f => f.slug === slug);
  return record?.detectionConfidence !== 'weak';
}

export type FrameworkMismatchResult =
  | 'none-detected'
  | 'match'
  | 'low-confidence'
  | 'configured-mismatch'
  | 'unused-mismatch';

/**
 * Warn when the frameworks detected from the source code do not match how
 * the project was actually built: either a configured framework that was not
 * detected, or a detected framework whose builder was never used.
 */
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

  // No framework configured: check whether the build used any detected
  // framework via a framework-tagged build config or its runtime builder.
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

  // Frameworks without a `useRuntime` legitimately build via
  // `@vercel/static-build`, so their absence from the used builders proves
  // nothing — only warn when a dedicated runtime builder was expected.
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
