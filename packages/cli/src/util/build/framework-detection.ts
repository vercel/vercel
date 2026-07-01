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
 * Warn the user when the framework configured for the project does not match
 * any framework detected from the source code.
 */
export function warnIfConfiguredFrameworkMismatch(options: {
  configuredFramework: string | null | undefined;
  detectedFrameworks: string[];
}): void {
  const { configuredFramework, detectedFrameworks } = options;

  if (!configuredFramework) {
    logDebug(
      'Framework cross-check: no configured framework to compare against; skipping'
    );
    return;
  }

  if (detectedFrameworks.length === 0) {
    logDebug(
      `Framework cross-check: nothing detected from source; cannot validate configured framework "${configuredFramework}"`
    );
    return;
  }

  if (detectedFrameworks.includes(configuredFramework)) {
    logDebug(
      `Framework cross-check: configured framework "${configuredFramework}" matches detected frameworks; no mismatch`
    );
    return;
  }

  logDebug(
    `Framework cross-check: configured framework "${configuredFramework}" not among detected [${detectedFrameworks.join(
      ', '
    )}]; warning`
  );
  output.warn(
    `Your project is configured to use the "${configuredFramework}" framework, but the source code looks like it's for: ${detectedFrameworks.join(
      ', '
    )}. This may be a misconfiguration.`,
    null,
    'https://vercel.com/docs/project-configuration',
    'Learn More'
  );
}
