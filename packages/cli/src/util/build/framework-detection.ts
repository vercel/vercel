import {
  LocalFileSystemDetector,
  detectFrameworkRecord,
  detectFrameworks,
} from '@vercel/fs-detectors';
import { frameworkList, type Framework } from '@vercel/frameworks';
import { debug as builderDebug } from '@vercel/build-utils';
import output from '../../output-manager';

/** Debug log to both `--debug` output and the `VERCEL_BUILDER_DEBUG` channel. */
function logDebug(message: string): void {
  output.debug(message);
  builderDebug(message);
}

/** Whether the end-of-build framework cross-check is enabled. */
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

/** Whether this is a project's first deployment (set by the deploy pipeline). */
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

/** Result of first-deployment framework detection, recorded in `builds.json`. */
export interface DetectedFramework {
  status: 'detected' | 'not-detected' | 'skipped';
  slug?: string;
  version?: string;
}

/**
 * On a project's first deployment with no configured framework, detect it from
 * source and apply it to `projectSettings` (mutated in place so a later
 * `detectBuilders` sees it). Gated by `VERCEL_FIRST_DEPLOYMENT`.
 */
export async function detectFirstDeploymentFramework(options: {
  workPath: string;
  projectSettings: { framework?: string | null };
}): Promise<DetectedFramework> {
  const { workPath, projectSettings } = options;

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

/** Detect all frameworks matching the source at `workPath`, returning slugs. */
export async function detectAllFrameworks(
  workPath: string,
  customFrameworkList?: readonly Framework[]
): Promise<string[]> {
  logDebug(`Framework cross-check: detecting frameworks at "${workPath}"`);
  const frameworks = await detectFrameworks({
    fs: new LocalFileSystemDetector(workPath),
    frameworkList: customFrameworkList ?? frameworkList,
  });
  const slugs = frameworks
    .map(f => f.slug)
    .filter((slug): slug is string => Boolean(slug));
  logDebug(`Framework cross-check: detected [${slugs.join(', ') || '<none>'}]`);
  return slugs;
}

/** Weak-signal frameworks may confirm a match but never warn on their own. */
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

/** Warn when detected frameworks don't match how the project was built. */
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

  // No framework configured: did the build use a detected framework's builder?
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

  // Only warn for frameworks with a dedicated runtime builder; others
  // legitimately build via `@vercel/static-build`.
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
