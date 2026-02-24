import fs from 'fs';
import { join } from 'path';
import {
  parseEntrypointVariable,
  getStringConstant,
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
  return (await getGenericEntrypointVariable(file)) !== null;
}

/**
 * Returns the entrypoint variable name for a Python entrypoint file,
 * or null if the file is not a valid entrypoint.
 */
export async function getGenericEntrypointVariable(
  file: FileFsRef | { fsPath?: string }
): Promise<string | null> {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return null;
    const content = await fs.promises.readFile(fsPath, 'utf-8');
    return await parseEntrypointVariable(content);
  } catch (err) {
    debug(`Failed to check Python entrypoint: ${err}`);
    return null;
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
 * returning [modulePath, variableName] for ASGI_APPLICATION or WSGI_APPLICATION
 * (e.g. 'myapp.wsgi.application' -> ['myapp/wsgi.py', 'application']).
 * Returns null if any step fails.
 */
export async function getDjangoEntrypoint(
  workPath: string
): Promise<[string, string] | null> {
  const settingsModule = await getDjangoSettingsModule(workPath);
  if (!settingsModule) return null;
  const settingsPath = join(
    workPath,
    `${settingsModule.replace(/\./g, '/')}.py`
  );
  try {
    const settingsContent = await fs.promises.readFile(settingsPath, 'utf-8');
    const asgiApplication = await getStringConstant(
      settingsContent,
      'ASGI_APPLICATION'
    );
    if (asgiApplication) {
      const parts = asgiApplication.split('.');
      const varName = parts[parts.length - 1];
      const asgiPath = `${parts.slice(0, -1).join('/')}.py`;
      debug(`Django ASGI entrypoint from ${settingsModule}: ${asgiPath}`);
      return [asgiPath, varName];
    }
    const wsgiApplication = await getStringConstant(
      settingsContent,
      'WSGI_APPLICATION'
    );
    if (wsgiApplication) {
      const parts = wsgiApplication.split('.');
      const varName = parts[parts.length - 1];
      const wsgiPath = `${parts.slice(0, -1).join('/')}.py`;
      debug(`Django WSGI entrypoint from ${settingsModule}: ${wsgiPath}`);
      return [wsgiPath, varName];
    }
  } catch {
    debug(`Failed to read or parse settings file: ${settingsPath}`);
  }
  return null;
}
