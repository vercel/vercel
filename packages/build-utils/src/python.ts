import fs from 'fs';
import { join } from 'path';
import {
  containsAppOrHandler,
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
 * Read Procfile at workPath and parse the web process. Supports:
 * - web: gunicorn <module> or <module>:<attr>
 * - web: uvicorn <module> or <module>:<attr>
 * - web: uwsgi <settings>.ini (reads module = <appModule> from the INI)
 * Returns the corresponding Python file path or null.
 */
export async function getProcfileWebEntrypoint(
  workPath: string
): Promise<string | null> {
  try {
    const procfilePath = join(workPath, 'Procfile');
    const procfileContent = await fs.promises.readFile(procfilePath, 'utf-8');
    const gunicornUvicorn = parseProcfileWebGunicornUvicorn(procfileContent);
    if (gunicornUvicorn) return gunicornUvicorn;
    const uwsgiIni = await parseProcfileWebUwsgiIni(workPath, procfileContent);
    if (uwsgiIni) return uwsgiIni;
  } catch {
    debug('Procfile not found or unreadable, skipping Procfile web entrypoint');
  }
  return null;
}

const PY_ID = '[A-Za-z_][A-Za-z0-9_]*';
const APP_SPEC_PATTERN = `${PY_ID}(?:\\.${PY_ID})*(?::${PY_ID})?`;

function moduleSpecToPath(appSpec: string): string {
  const modulePath = appSpec.split(':')[0];
  return `${modulePath.replace(/\./g, '/')}.py`;
}

/**
 * Parse Procfile content for "web: gunicorn <module>" or "web: uvicorn <module>".
 * Returns the corresponding .py path or null.
 */
function parseProcfileWebGunicornUvicorn(
  procfileContent: string
): string | null {
  const match = procfileContent.match(
    new RegExp(`web:\\s*(?:gunicorn|uvicorn)\\s+(${APP_SPEC_PATTERN})`)
  );
  return match ? moduleSpecToPath(match[1]) : null;
}

/**
 * Parse Procfile content for "web: uwsgi <settings>.ini", then read the INI
 * and extract "module = <appModule>" or "module = <appModule>:<attr>".
 * Returns the corresponding .py path or null.
 */
async function parseProcfileWebUwsgiIni(
  workPath: string,
  procfileContent: string
): Promise<string | null> {
  const uwsgiMatch = procfileContent.match(/web:\s*uwsgi\s+(\S+\.ini)/);
  if (!uwsgiMatch) return null;
  const iniPath = join(workPath, uwsgiMatch[1]);
  try {
    const iniContent = await fs.promises.readFile(iniPath, 'utf-8');
    const match = iniContent.match(
      new RegExp(`^\\s*module\\s*=\\s*(${APP_SPEC_PATTERN})\\s*$`, 'm')
    );
    return match ? moduleSpecToPath(match[1]) : null;
  } catch {
    debug(`uWSGI config not found or unreadable: ${iniPath}`);
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
 * For Django projects: resolve the WSGI application entrypoint by reading
 * DJANGO_SETTINGS_MODULE from manage.py, loading that settings file, and
 * returning the file path for WSGI_APPLICATION (e.g. 'myapp.wsgi.application'
 * -> 'myapp/wsgi.py'). Returns null if any step fails.
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
  try {
    const settingsContent = await fs.promises.readFile(settingsPath, 'utf-8');
    const wsgiApplication = await getStringConstant(
      settingsContent,
      'WSGI_APPLICATION'
    );
    if (wsgiApplication) {
      const modulePath = wsgiApplication.split('.').slice(0, -1).join('/');
      const wsgiPath = `${modulePath}.py`;
      debug(`Django WSGI entrypoint from ${settingsModule}: ${wsgiPath}`);
      return wsgiPath;
    }
  } catch {
    debug(`Failed to read or parse settings file: ${settingsPath}`);
  }
  return null;
}
