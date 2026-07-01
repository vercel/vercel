import type Client from '../client';
import {
  LocalFileSystemDetector,
  detectFrameworkRecord,
  detectFrameworks,
} from '@vercel/fs-detectors';
import { frameworkList } from '@vercel/frameworks';
import output from '../../output-manager';

/**
 * Whether this is the very first deployment for a project, as signalled by the
 * `VERCEL_FIRST_DEPLOYMENT` environment variable (set by api-deployments when
 * it creates a brand-new project).
 */
export function isFirstDeployment(): boolean {
  const raw = process.env.VERCEL_FIRST_DEPLOYMENT;
  const result = raw === '1';
  output.debug(
    `isFirstDeployment: VERCEL_FIRST_DEPLOYMENT=${
      raw === undefined ? '<unset>' : JSON.stringify(raw)
    } -> ${result}`
  );
  return result;
}

/**
 * On a project's first deployment, detect the framework from the source code
 * and persist it to the project settings. Returns the detected framework slug,
 * or `null` if nothing was detected or detection did not run.
 *
 * Persistence failures never fail the build.
 */
export async function detectAndPersistFirstDeploymentFramework(options: {
  client: Client;
  workPath: string;
  projectSettings: { framework?: string | null };
  projectId?: string;
  orgId?: string;
}): Promise<string | null> {
  const { client, workPath, projectSettings, projectId, orgId } = options;

  output.debug(
    `First deployment: evaluating framework detection (workPath="${workPath}", ` +
      `projectId=${projectId ? `"${projectId}"` : '<none>'}, ` +
      `orgId=${orgId ? `"${orgId}"` : '<none>'}, ` +
      `configuredFramework=${
        projectSettings.framework ? `"${projectSettings.framework}"` : '<none>'
      })`
  );

  // Disambiguate the two skip conditions so it is clear in logs why the
  // first-deployment path did not run.
  if (!isFirstDeployment()) {
    output.debug(
      'First deployment: skipping framework detection because this is not a first deployment'
    );
    return null;
  }

  if (projectSettings.framework) {
    output.debug(
      `First deployment: skipping framework detection because a framework is already configured ("${projectSettings.framework}")`
    );
    return null;
  }

  output.debug(
    `First deployment: no framework configured; detecting from source at "${workPath}"`
  );

  const detected = await detectFrameworkRecord({
    fs: new LocalFileSystemDetector(workPath),
    frameworkList,
  });

  if (!detected || !detected.slug) {
    output.debug('First deployment: no framework detected from source code');
    return null;
  }

  const { slug } = detected;

  // Mutate in-memory so the current build uses the detected framework.
  projectSettings.framework = slug;
  output.debug(
    `First deployment: detected framework "${slug}"${
      detected.detectedVersion ? ` (version ${detected.detectedVersion})` : ''
    }; applied to project settings for this build`
  );

  if (projectId && orgId) {
    output.debug(
      `First deployment: persisting framework "${slug}" to project "${projectId}"`
    );
    try {
      await client.fetch(`/v9/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ framework: slug }),
        headers: { 'Content-Type': 'application/json' },
        accountId: orgId,
      });
      output.debug(`First deployment: persisted framework "${slug}"`);
    } catch (err) {
      output.debug(
        `First deployment: failed to persist framework "${slug}": ${err}`
      );
    }
  } else {
    output.debug(
      'First deployment: not persisting framework because the project is not linked (missing projectId/orgId)'
    );
  }

  return slug;
}

/**
 * Detect all frameworks that match the source code at `workPath`, returning
 * their slugs.
 */
export async function detectAllFrameworks(workPath: string): Promise<string[]> {
  output.debug(`Framework cross-check: detecting frameworks at "${workPath}"`);
  const frameworks = await detectFrameworks({
    fs: new LocalFileSystemDetector(workPath),
    frameworkList,
  });
  const slugs = frameworks
    .map(f => f.slug)
    .filter((slug): slug is string => Boolean(slug));
  output.debug(
    `Framework cross-check: detected [${slugs.join(', ') || '<none>'}]`
  );
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
    output.debug(
      'Framework cross-check: no configured framework to compare against; skipping'
    );
    return;
  }

  if (detectedFrameworks.length === 0) {
    output.debug(
      `Framework cross-check: nothing detected from source; cannot validate configured framework "${configuredFramework}"`
    );
    return;
  }

  if (detectedFrameworks.includes(configuredFramework)) {
    output.debug(
      `Framework cross-check: configured framework "${configuredFramework}" matches detected frameworks; no mismatch`
    );
    return;
  }

  output.debug(
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
