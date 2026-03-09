import fs from 'fs';
import { join, relative, resolve } from 'path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

export interface DjangoCollectStaticResult {
  /** Absolute paths of source static dirs to exclude from the Lambda bundle. */
  staticSourceDirs: string[];
  /** Absolute path of STATIC_ROOT to exclude from the Lambda bundle. */
  staticRoot: string | null;
  /**
   * workPath-relative path to `staticfiles.json` to inject into the Lambda
   * bundle, or null if the storage backend doesn't use a manifest.
   */
  manifestRelPath: string | null;
}

/**
 * Run Django's collectstatic during the Vercel build:
 *
 * 1. Write a temporary settings shim that redirects STATIC_ROOT to
 *    `public/<STATIC_URL path>/` so the CDN can serve the files.
 * 2. Run `manage.py collectstatic --noinput` with the shim.
 * 3. Delete the shim.
 * 4. If the storage backend writes a manifest (`staticfiles.json`), copy it
 *    to the user's original STATIC_ROOT so Lambda can read it at runtime.
 *
 * Special cases:
 * - If django-storages is detected, run collectstatic without the shim and return
 *   null. django-storages handles its own upload to some other CDN.
 * - If STATIC_ROOT is not set and WHITENOISE_USE_FINDERS is false, skip
 *   everything and return null.
 */
export async function runDjangoCollectStatic(
  venvPath: string,
  workPath: string,
  env: NodeJS.ProcessEnv,
  outputStaticDir: string,
  djangoSettings: Record<string, unknown> | null
): Promise<DjangoCollectStaticResult | null> {
  if (!djangoSettings) {
    debug('No Django settings available, skipping collectstatic');
    return null;
  }

  const pythonPath = getVenvPythonBin(venvPath);
  const settingsModule = djangoSettings['__DJANGO_SETTINGS_MODULE'] as string;

  // Resolve storage backend
  // First check STORAGES (Django 4.2+) then the legacy STATICFILES_STORAGE setting.
  const storages = djangoSettings['STORAGES'] as
    | { staticfiles?: { BACKEND?: string } }
    | undefined;
  const storageBackend: string =
    storages?.staticfiles?.BACKEND ??
    (djangoSettings['STATICFILES_STORAGE'] as string | undefined) ??
    'django.contrib.staticfiles.storage.StaticFilesStorage';

  // When django-storages is the storage backend
  // Run collectstatic with the user's real settings, it will upload to S3/GCS/etc.
  // No CDN bundling or manifest work needed.
  if (storageBackend.startsWith('storages.backends.')) {
    console.log(
      'django-storages detected — running collectstatic with original settings'
    );
    await execa(pythonPath, ['manage.py', 'collectstatic', '--noinput'], {
      env: { ...env, DJANGO_SETTINGS_MODULE: settingsModule },
      cwd: workPath,
    });
    return null;
  }

  const staticUrl =
    (djangoSettings['STATIC_URL'] as string | undefined) ?? '/static/';
  const staticRoot =
    djangoSettings['STATIC_ROOT'] != null
      ? String(djangoSettings['STATIC_ROOT'])
      : null;
  const whitenoiseUseFinders =
    djangoSettings['WHITENOISE_USE_FINDERS'] === true;

  // No local static strategy configured — warn and skip.
  if (!staticRoot && !whitenoiseUseFinders) {
    debug('No collectstatic strategy configured — skipping collectstatic');
    return null;
  }

  // Get the static file directories.
  // Each installed app may have a 'static' subdirectory.
  // STATICFILES_DIRS is an additional list of directories.
  const installedApps =
    (djangoSettings['INSTALLED_APPS'] as string[] | undefined) ?? [];
  const staticfilesDirs =
    (djangoSettings['STATICFILES_DIRS'] as
      | (string | [string, string])[]
      | undefined) ?? [];
  const staticSourceDirs = [
    ...installedApps.map(app => join(workPath, ...app.split('.'), 'static')),
    // TODO: Deal with optional prefixes in STATICFILES_DIRS.
    ...staticfilesDirs.map(d => (Array.isArray(d) ? d[1] : d)),
  ].filter(d => fs.existsSync(d));

  // Strip leading/trailing slashes from STATIC_URL to get the CDN sub-path.
  // e.g. '/static/' -> 'static', '/app/static/' -> 'app/static'
  const staticUrlPath = staticUrl.replace(/^\/|\/$/g, '') || 'static';

  // Write a temporary settings shim that overrides STATIC_ROOT to point
  // directly at the Vercel Build Output static directory.
  const staticOutputDir = join(outputStaticDir, staticUrlPath);
  await fs.promises.mkdir(staticOutputDir, { recursive: true });
  const shimPath = join(workPath, '_vercel_collectstatic_settings.py');
  const shimLines = [
    `from ${settingsModule} import *`,
    `STATIC_ROOT = ${JSON.stringify(staticOutputDir)}`,
  ];
  if (whitenoiseUseFinders) {
    shimLines.push(`WHITENOISE_USE_FINDERS = False`);
  }
  await fs.promises.writeFile(shimPath, shimLines.join('\n') + '\n');

  try {
    console.log('Running collectstatic...');
    await execa(pythonPath, ['manage.py', 'collectstatic', '--noinput'], {
      env: {
        ...env,
        DJANGO_SETTINGS_MODULE: '_vercel_collectstatic_settings',
      },
      cwd: workPath,
    });
  } finally {
    await fs.promises.unlink(shimPath).catch(() => {});
  }

  // If the storage backend writes a manifest, copy staticfiles.json from the
  // CDN output back to the user's original STATIC_ROOT so the Lambda can read
  // it at runtime for {% static %} resolution.
  const MANIFEST_STORAGE_BACKENDS = [
    'django.contrib.staticfiles.storage.ManifestStaticFilesStorage',
    'whitenoise.storage.CompressedManifestStaticFilesStorage',
  ];

  let manifestRelPath: string | null = null;
  if (MANIFEST_STORAGE_BACKENDS.includes(storageBackend) && staticRoot) {
    const manifestSrc = join(staticOutputDir, 'staticfiles.json');
    const resolvedStaticRoot = resolve(workPath, staticRoot);
    const manifestDest = join(resolvedStaticRoot, 'staticfiles.json');
    await fs.promises.mkdir(resolvedStaticRoot, { recursive: true });
    await fs.promises.copyFile(manifestSrc, manifestDest);
    manifestRelPath = relative(workPath, manifestDest);
    debug(`Copied staticfiles.json to ${manifestDest} for Lambda bundle`);
  }

  return {
    staticSourceDirs,
    staticRoot: staticRoot ? resolve(workPath, staticRoot) : null,
    manifestRelPath,
  };
}
