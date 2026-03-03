import fs from 'fs';
import { dirname, join } from 'path';
import {
  containsAppOrHandler,
  getStringConstant,
  getStringConstantOrImport,
  parseDjangoSettingsModule,
} from '@vercel/python-analysis';
import debug from './debug';
import FileFsRef from './file-fs-ref';

/**
 * Check if a Python file is a valid entrypoint by detecting:
 * - A top-level 'app' callable (Flask, FastAPI, Sanic, WSGI/ASGI, etc.)
 * - A top-level 'application' callable (Django)
 * - A top-level 'handler' class (BaseHTTPRequestHandler subclass)
 */
export async function isPythonEntrypoint(
  file: FileFsRef | { fsPath?: string }
): Promise<boolean> {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return false;
    const content = await fs.promises.readFile(fsPath, 'utf-8');
    return await containsAppOrHandler(content);
  } catch (err) {
    debug(`Failed to check Python entrypoint: ${err}`);
    return false;
  }
}

/**
 * For Django projects: read manage.py if present and return the value set for
 * DJANGO_SETTINGS_MODULE (e.g. from os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')).
 * Returns null if manage.py is missing or the pattern is not found.
 */
export async function getDjangoSettingsModule(
  workPath: string
): Promise<string | null> {
  const managePath = join(workPath, 'manage.py');
  try {
    const content = await fs.promises.readFile(managePath, 'utf-8');
    const value = await parseDjangoSettingsModule(content);
    if (value) {
      debug(`Django DJANGO_SETTINGS_MODULE from manage.py: ${value}`);
      return value;
    }
  } catch {
    debug('manage.py not found or unreadable, skipping Django settings module');
  }
  return null;
}

/**
 * For Django projects: resolve the ASGI or WSGI application entrypoint by reading
 * DJANGO_SETTINGS_MODULE from manage.py, loading that settings file, and
 * returning the file path for ASGI_APPLICATION or WSGI_APPLICATION (e.g.
 * 'myapp.asgi.application' -> 'myapp/asgi.py'). Returns null if any step fails.
 *
 * When the settings file does not define the application constant directly,
 * sibling imports are followed one level deep.
 */
export async function getDjangoEntrypoint(
  workPath: string
): Promise<string | null> {
  const settingsModule = await getDjangoSettingsModule(workPath);
  if (!settingsModule) return null;
  const settingsPath = join(
    workPath,
    `${settingsModule.replace(/\./g, '/')}.py`
  );
  let settingsContent: string;
  try {
    settingsContent = await fs.promises.readFile(settingsPath, 'utf-8');
  } catch {
    debug(`Failed to read settings file: ${settingsPath}`);
    return null;
  }

  for (const appKey of ['ASGI_APPLICATION', 'WSGI_APPLICATION'] as const) {
    const result = await getStringConstantOrImport(settingsContent, appKey);
    if (!result) continue;

    if (result.type === 'value') {
      const appPath = `${result.value.split('.').slice(0, -1).join('/')}.py`;
      debug(`Django ${appKey} entrypoint from ${settingsModule}: ${appPath}`);
      return appPath;
    }

    // Follow sibling imports one level deep.
    for (const siblingName of result.imports) {
      const siblingPath = join(dirname(settingsPath), `${siblingName}.py`);
      try {
        const siblingContent = await fs.promises.readFile(siblingPath, 'utf-8');
        const value = await getStringConstant(siblingContent, appKey);
        if (value) {
          const appPath = `${value.split('.').slice(0, -1).join('/')}.py`;
          debug(
            `Django ${appKey} entrypoint from ${settingsModule}/${siblingName}: ${appPath}`
          );
          return appPath;
        }
      } catch {
        debug(`Failed to read sibling settings: ${siblingPath}`);
      }
    }
  }

  return null;
}
