import fs from 'fs';
import { join, relative, resolve } from 'path';
import execa from 'execa';
import { debug, getDjangoSettingsModule } from '@vercel/build-utils';
import { getVenvPythonBin } from './utils';

export interface DjangoStaticSettings {
  staticUrl: string;
  staticRoot: string | null;
  staticfilesStorage: string;
  whitenoiseUseFinders: boolean;
  staticSourceDirs: string[];
  isDjangoStorages: boolean;
  hasManifestStorage: boolean;
}

// Fast settings extraction — no django.setup(), just a direct module import.
// Returns only the keys that are explicitly set; TypeScript fills in defaults.
const SETTINGS_SCRIPT = `
import sys, json, importlib

settings_module = sys.argv[1]
keys = json.loads(sys.argv[2])

mod = importlib.import_module(settings_module)
result = {k: getattr(mod, k) for k in keys if hasattr(mod, k)}
# Stringify non-JSON-serialisable values (e.g. pathlib.Path in STATIC_ROOT)
print(json.dumps(result, default=str))
`.trim();

const SETTINGS_KEYS = [
  'STATIC_URL',
  'STATIC_ROOT',
  'STATICFILES_STORAGE', // Django < 4.2
  'STORAGES', // Django 4.2+
  'WHITENOISE_USE_FINDERS',
];

// Slower finders extraction — requires django.setup() for the app registry.
// Non-fatal if it fails; caller falls back to an empty source-dirs list.
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

/**
 * Extract Django static settings by importing the settings module directly
 * (no django.setup()). Also runs the finders script to discover source static
 * dirs; finders failure is non-fatal — staticSourceDirs will be empty.
 *
 * Returns null if the settings script itself fails (e.g. Django not installed,
 * bad import) — caller should warn and skip static handling.
 */
export async function getDjangoStaticSettings(
  pythonPath: string,
  settingsModule: string,
  workPath: string,
  env: NodeJS.ProcessEnv
): Promise<DjangoStaticSettings | null> {
  // Run both scripts concurrently; finders failure is non-fatal.
  const [settingsResult, findersResult] = await Promise.allSettled([
    execa(
      pythonPath,
      ['-c', SETTINGS_SCRIPT, settingsModule, JSON.stringify(SETTINGS_KEYS)],
      { env, cwd: workPath }
    ),
    execa(pythonPath, ['-c', FINDERS_SCRIPT, settingsModule], {
      env,
      cwd: workPath,
    }),
  ]);

  if (settingsResult.status === 'rejected') {
    debug(`Failed to extract Django static settings: ${settingsResult.reason}`);
    return null;
  }

  if (findersResult.status === 'rejected') {
    debug(
      `Failed to extract Django static source dirs: ${findersResult.reason}`
    );
  }

  const raw = JSON.parse(settingsResult.value.stdout.trim());

  // Resolve storage backend: STORAGES (Django 4.2+) takes precedence over
  // the legacy STATICFILES_STORAGE setting.
  const storage: string =
    raw.STORAGES?.staticfiles?.BACKEND ??
    raw.STATICFILES_STORAGE ??
    'django.contrib.staticfiles.storage.StaticFilesStorage';

  const staticSourceDirs: string[] =
    findersResult.status === 'fulfilled'
      ? JSON.parse(findersResult.value.stdout.trim())
      : [];

  return {
    staticUrl: raw.STATIC_URL ?? '/static/',
    staticRoot: raw.STATIC_ROOT != null ? String(raw.STATIC_ROOT) : null,
    staticfilesStorage: storage,
    whitenoiseUseFinders: raw.WHITENOISE_USE_FINDERS === true,
    staticSourceDirs,
    isDjangoStorages: storage.includes('storages.'),
    hasManifestStorage: storage.includes('ManifestStaticFilesStorage'),
  };
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
 * 1. Extract static settings from the project's Django configuration.
 * 2. Write a temporary settings shim that redirects STATIC_ROOT to
 *    `public/<STATIC_URL path>/` so the CDN can serve the files.
 * 3. Run `manage.py collectstatic --noinput` with the shim.
 * 4. Delete the shim.
 * 5. If the storage backend writes a manifest (`staticfiles.json`), copy it
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
  outputStaticDir: string
): Promise<DjangoCollectStaticResult | null> {
  const settingsModule = await getDjangoSettingsModule(workPath);
  if (!settingsModule) {
    debug('No Django settings module found, skipping collectstatic');
    return null;
  }

  const pythonPath = getVenvPythonBin(venvPath);
  const settings = await getDjangoStaticSettings(
    pythonPath,
    settingsModule,
    workPath,
    env
  );
  if (!settings) {
    debug('Failed to extract Django static settings, skipping collectstatic');
    return null;
  }

  // django-storages: run collectstatic with the user's real settings so it
  // uploads to S3/GCS/etc. No CDN bundling or manifest work needed.
  if (settings.isDjangoStorages) {
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
  if (!settings.staticRoot && !settings.whitenoiseUseFinders) {
    debug('No collectstatic strategy configured — skipping collectstatic');
    return null;
  }

  // Strip leading/trailing slashes from STATIC_URL to get the CDN sub-path.
  // e.g. '/static/' -> 'static', '/app/static/' -> 'app/static'
  const staticUrlPath = settings.staticUrl.replace(/^\/|\/$/g, '') || 'static';

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
  if (settings.whitenoiseUseFinders) {
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
  if (settings.hasManifestStorage && settings.staticRoot) {
    const manifestSrc = join(staticOutputDir, 'staticfiles.json');
    // staticRoot may be relative (e.g. 'staticfiles') or absolute.
    const resolvedStaticRoot = resolve(workPath, settings.staticRoot);
    const manifestDest = join(resolvedStaticRoot, 'staticfiles.json');
    await fs.promises.mkdir(resolvedStaticRoot, { recursive: true });
    await fs.promises.copyFile(manifestSrc, manifestDest);
    manifestRelPath = relative(workPath, manifestDest);
    debug(`Copied staticfiles.json to ${manifestDest} for Lambda bundle`);
  }

  return {
    staticSourceDirs: settings.staticSourceDirs,
    manifestRelPath,
  };
}
