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
  return process.env.VERCEL_FIRST_DEPLOYMENT === '1';
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

  if (!isFirstDeployment() || projectSettings.framework) {
    return null;
  }

  const detected = await detectFrameworkRecord({
    fs: new LocalFileSystemDetector(workPath),
    frameworkList,
  });

  if (!detected || !detected.slug) {
    output.debug('First deployment: no framework detected');
    return null;
  }

  const { slug } = detected;

  // Mutate in-memory so the current build uses the detected framework.
  projectSettings.framework = slug;
  output.debug(`First deployment: detected framework "${slug}"`);

  if (projectId && orgId) {
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
  }

  return slug;
}

/**
 * Detect all frameworks that match the source code at `workPath`, returning
 * their slugs.
 */
export async function detectAllFrameworks(workPath: string): Promise<string[]> {
  const frameworks = await detectFrameworks({
    fs: new LocalFileSystemDetector(workPath),
    frameworkList,
  });
  return frameworks
    .map(f => f.slug)
    .filter((slug): slug is string => Boolean(slug));
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
    return;
  }

  if (detectedFrameworks.length === 0) {
    return;
  }

  if (detectedFrameworks.includes(configuredFramework)) {
    return;
  }

  output.warn(
    `Your project is configured to use the "${configuredFramework}" framework, but the source code looks like it's for: ${detectedFrameworks.join(
      ', '
    )}. This may be a misconfiguration.`,
    null,
    'https://vercel.com/docs/project-configuration',
    'Learn More'
  );
}
