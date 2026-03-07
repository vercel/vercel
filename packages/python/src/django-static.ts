import fs from 'fs';
import { join, relative, resolve } from 'path';
import execa from 'execa';
import { debug, getDjangoSettingsModule } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

// Requires django.setup() for the app registry.
// Non-fatal if it fails; caller falls back to an empty list.
const FINDERS_SCRIPT = `
import sys, json, os
import django

settings_module = sys.argv[1]
os.environ.setdefault('DJANGO_SETTINGS_MODULE', settings_module)
django.setup()

from django.contrib.staticfiles.finders import get_finders

dirs = []
for finder in get_finders():
    if hasattr(finder, 'locations'):    # FileSystemFinder (STATICFILES_DIRS)
        dirs.extend(loc[1] for loc in finder.locations)
    if hasattr(finder, 'storages'):     # AppDirectoriesFinder (<app>/static/)
        for storage in finder.storages.values():
            if hasattr(storage, 'location'):
                dirs.append(storage.location)

print(json.dumps(list(dict.fromkeys(filter(None, dirs)))))
`.trim();

async function getStaticSourceDirs(
  pythonPath: string,
  settingsModule: string,
  workPath: string,
  env: NodeJS.ProcessEnv
): Promise<string[]> {
  try {
    const result = await execa(
      pythonPath,
      ['-c', FINDERS_SCRIPT, settingsModule],
      { env, cwd: workPath }
    );
    return JSON.parse(result.stdout.trim());
  } catch (err) {
    debug(`Failed to extract Django static source dirs: ${err}`);
    return [];
  }
}

export interface DjangoCollectStaticResult {
  /** Absolute paths of source static dirs to exclude from the Lambda bundle. */
  staticSourceDirs: string[];
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

  const settingsModule = await getDjangoSettingsModule(workPath);
  if (!settingsModule) {
    debug('No Django settings module found, skipping collectstatic');
    return null;
  }

  // Resolve storage backend: STORAGES (Django 4.2+) takes precedence over
  // the legacy STATICFILES_STORAGE setting.
  const storages = djangoSettings['STORAGES'] as
    | { staticfiles?: { BACKEND?: string } }
    | undefined;
  const storage: string =
    storages?.staticfiles?.BACKEND ??
    (djangoSettings['STATICFILES_STORAGE'] as string | undefined) ??
    'django.contrib.staticfiles.storage.StaticFilesStorage';

  const staticUrl =
    (djangoSettings['STATIC_URL'] as string | undefined) ?? '/static/';
  const staticRoot =
    djangoSettings['STATIC_ROOT'] != null
      ? String(djangoSettings['STATIC_ROOT'])
      : null;
  const whitenoiseUseFinders =
    djangoSettings['WHITENOISE_USE_FINDERS'] === true;

  const pythonPath = getVenvPythonBin(venvPath);

  // django-storages: run collectstatic with the user's real settings so it
  // uploads to S3/GCS/etc. No CDN bundling or manifest work needed.
  if (storage.includes('storages.')) {
    console.log(
      'django-storages detected — running collectstatic with original settings'
    );
    await execa(pythonPath, ['manage.py', 'collectstatic', '--noinput'], {
      env: { ...env, DJANGO_SETTINGS_MODULE: settingsModule },
      cwd: workPath,
    });
    return null;
  }

  // No local static strategy configured — warn and skip.
  if (!staticRoot && !whitenoiseUseFinders) {
    debug('No collectstatic strategy configured — skipping collectstatic');
    return null;
  }

  const staticSourceDirs = await getStaticSourceDirs(
    pythonPath,
    settingsModule,
    workPath,
    env
  );

  // Strip leading/trailing slashes from STATIC_URL to get the CDN sub-path.
  // e.g. '/static/' -> 'static', '/app/static/' -> 'app/static'
  const staticUrlPath = staticUrl.replace(/^\/|\/$/g, '') || 'static';

  // Write a temporary settings shim that overrides STATIC_ROOT to point
  // directly at the Vercel Build Output static directory. Bypasses the
  // @vercel/static builder, which only scans files before any builder runs.
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
  let manifestRelPath: string | null = null;
  if (storage.includes('ManifestStaticFilesStorage') && staticRoot) {
    const manifestSrc = join(staticOutputDir, 'staticfiles.json');
    // staticRoot may be relative (e.g. 'staticfiles') or absolute.
    const resolvedStaticRoot = resolve(workPath, staticRoot);
    const manifestDest = join(resolvedStaticRoot, 'staticfiles.json');
    await fs.promises.mkdir(resolvedStaticRoot, { recursive: true });
    await fs.promises.copyFile(manifestSrc, manifestDest);
    manifestRelPath = relative(workPath, manifestDest);
    debug(`Copied staticfiles.json to ${manifestDest} for Lambda bundle`);
  }

  return {
    staticSourceDirs,
    manifestRelPath,
  };
}
