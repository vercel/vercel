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
    const gunicorn = await parseProcfileWebGunicorn(workPath, procfileContent);
    if (gunicorn) return gunicorn;
    const uvicorn = parseProcfileWebUvicorn(procfileContent);
    if (uvicorn) return uvicorn;
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
 * Parse Procfile content for "web: gunicorn [OPTIONS] [APP_MODULE]".
 *
 * If APP_MODULE is provided, use it to determine the Python file path.
 * Otherwise look for the app in the config file: -c / --config path, or default
 * to gunicorn.conf.py. The config file may set wsgi_app = "module:attr".
 */
async function parseProcfileWebGunicorn(
  workPath: string,
  procfileContent: string
): Promise<string | null> {
  const webGunicornMatch = procfileContent.match(/web:\s*gunicorn\s*(.*)/);
  if (!webGunicornMatch) return null;
  const args = webGunicornMatch[1].trim().split(/\s+/);
  const appSpecRe = new RegExp(`^${APP_SPEC_PATTERN}$`);
  const lastIsOptionArg =
    args.length >= 2 && GUNICORN_OPTIONS_WITH_ARG.has(args[args.length - 2]);
  if (
    args.length > 0 &&
    !lastIsOptionArg &&
    appSpecRe.test(args[args.length - 1])
  ) {
    const wsgiApp = args[args.length - 1];
    debug(`Gunicorn app as command line argument: ${wsgiApp}`);
    return moduleSpecToPath(wsgiApp);
  }

  const configPath = getGunicornConfigPath(args);
  const configFullPath = join(workPath, configPath);
  try {
    const configContent = await fs.promises.readFile(configFullPath, 'utf-8');
    const wsgiApp = await getStringConstant(configContent, 'wsgi_app');
    debug(`Gunicorn app from config file: ${wsgiApp}`);
    return wsgiApp ? moduleSpecToPath(wsgiApp) : null;
  } catch {
    debug(`Gunicorn config not found or unreadable: ${configFullPath}`);
    return null;
  }
}

/** Gunicorn CLI flags that take an argument (per docs.gunicorn.org/reference/settings) */
const GUNICORN_OPTIONS_WITH_ARG = new Set([
  '-c',
  '--config',
  '--control-socket',
  '--control-socket-mode',
  '--reload-engine',
  '--reload-extra-file',
  '--dirty-app',
  '--dirty-workers',
  '--dirty-timeout',
  '--dirty-threads',
  '--dirty-graceful-timeout',
  '--http-protocols',
  '--http2-max-concurrent-streams',
  '--http2-initial-window-size',
  '--http2-max-frame-size',
  '--http2-max-header-list-size',
  '--access-logfile',
  '--access-logformat',
  '--error-logfile',
  '--log-file',
  '--log-level',
  '--logger-class',
  '--log-config',
  '--log-config-json',
  '--log-syslog-to',
  '--log-syslog-prefix',
  '--log-syslog-facility',
  '--statsd-host',
  '--dogstatsd-tags',
  '--statsd-prefix',
  '-n',
  '--name',
  '--keyfile',
  '--certfile',
  '--ca-certs',
  '--limit-request-line',
  '--limit-request-fields',
  '--limit-request-field_size',
  '--chdir',
  '-e',
  '--env',
  '-p',
  '--pid',
  '--worker-tmp-dir',
  '-u',
  '--user',
  '-g',
  '--group',
  '-m',
  '--umask',
  '--forwarded-allow-ips',
  '--pythonpath',
  '--paste',
  '--paster',
  '--proxy-protocol',
  '--protocol',
  '--paste-global',
  '--root-path',
  '-b',
  '--bind',
  '--backlog',
  '-w',
  '--workers',
  '-k',
  '--worker-class',
  '--threads',
  '--worker-connections',
  '--max-requests',
  '--max-requests-jitter',
  '-t',
  '--timeout',
  '--graceful-timeout',
  '--keep-alive',
  '--asgi-loop',
  '--asgi-lifespan',
  '--asgi-disconnect-grace-period',
]);

/** Extract config path from gunicorn args (-c / --config / --config=). */
function getGunicornConfigPath(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-c' || args[i] === '--config')
      return args[i + 1] ?? 'gunicorn.conf.py';
    if (args[i].startsWith('--config=')) return args[i].slice(9);
  }
  return 'gunicorn.conf.py';
}

/**
 * Parse Procfile content for "web: uvicorn <module>" or "web: uvicorn <module>:<attr>".
 * Returns the corresponding .py path or null.
 */
function parseProcfileWebUvicorn(procfileContent: string): string | null {
  const match = procfileContent.match(
    new RegExp(`web:\\s*uvicorn\\s+(${APP_SPEC_PATTERN})`)
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
