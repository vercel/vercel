import { detectFrameworks } from '../detect-framework';
import type { DetectorFilesystem } from '../detectors/filesystem';
import type {
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceDetectionError,
  ServiceDetectionWarning,
} from './types';
import { assignRoutePrefixes, DETECTION_FRAMEWORKS } from './utils';

export interface ProcfileDetectResult {
  services: ExperimentalServices | null;
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}

interface ProcfileEntry {
  processType: string;
  command: string;
}

const PROCFILE = 'Procfile';
const PROCFILE_LINE_RE = /^\s*([A-Za-z_][\w-]*):\s*(.+)/;

// to handle entrypoints inferring from commands like:
// web: gunicorn myapp.app:app
const PY_IDENT = '[A-Za-z_][A-Za-z0-9_]*';
const PY_MODULE_RE = new RegExp(
  `^${PY_IDENT}(?:\\.${PY_IDENT})*(?::${PY_IDENT})?$`
);

const SUPPORTED_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.ru',
]);

const SUPPORTED_WORKER_COMMANDS = new Set(['celery', 'dramatiq']);

/**
 * Detect service configurations from a Procfile.
 *
 * We infer runtime and entrypoint from the start command where possible,
 * then run framework detection from the project root to fill in the framework.
 *
 * Process type mapping:
 * - `web`: web service
 * - `release`: embeded into one of web service's buildCommand
 * - `worker`-like process name: try to infer entrypoint for support Python worker or produce a hint
 * - everything else is tried to be inferred as `web` or produces a hint
 */
export async function detectProcfileServices(options: {
  fs: DetectorFilesystem;
}): Promise<ProcfileDetectResult> {
  const { fs } = options;

  const raw = await readProcfile(fs);
  if (raw.warning) {
    return { services: null, errors: [], warnings: [raw.warning] };
  }
  if (!raw.content) {
    return { services: null, errors: [], warnings: [] };
  }

  const entries = parseProcfile(raw.content);
  if (entries.length === 0) {
    return { services: null, errors: [], warnings: [] };
  }

  const services: ExperimentalServices = {};
  const errors: ServiceDetectionError[] = [];
  const warnings: ServiceDetectionWarning[] = [];

  // Separate release process from other real processes
  // release will later be used as a suggestion for buildCommand
  let releaseCommand: string | undefined;
  const serviceEntries: ProcfileEntry[] = [];

  for (const entry of entries) {
    if (entry.processType === 'release') {
      releaseCommand = entry.command;
    } else {
      serviceEntries.push(entry);
    }
  }

  if (serviceEntries.length === 0 && releaseCommand) {
    warnings.push({
      code: 'PROCFILE_RELEASE_ONLY',
      message:
        `Found only a release process in Procfile (command: "${releaseCommand}"). ` +
        `The release command can be used as a build step. You can add it as part of a web service ` +
        `if you add it to "buildCommand".`,
    });
    return { services: null, errors: [], warnings };
  }

  if (serviceEntries.length === 0) {
    return { services: null, errors: [], warnings: [] };
  }

  // Procfiles are single-runtime, framework detection from root
  // is the same for all processes, so we do it once
  const frameworks = await detectFrameworks({
    fs,
    frameworkList: DETECTION_FRAMEWORKS,
    useExperimentalFrameworks: true,
  });

  if (frameworks.length > 1) {
    const names = frameworks.map(f => f.name).join(', ');
    return {
      services: null,
      errors: [
        {
          code: 'MULTIPLE_FRAMEWORKS_SERVICE',
          message: `Multiple frameworks detected: ${names}. Use explicit experimentalServices config.`,
        },
      ],
      warnings,
    };
  }

  const detectedFramework = frameworks.length === 1 ? frameworks[0] : null;
  const serviceNames = new Set<string>();

  for (const entry of serviceEntries) {
    const { processType, command } = entry;
    const tokens = command.split(/\s+/).filter(Boolean);
    const entrypoint = await extractEntrypoint(tokens, fs);
    const isWorker = processType.includes('worker') || isWorkerCommand(tokens);

    if (serviceNames.has(processType)) {
      errors.push({
        code: 'DUPLICATE_SERVICE',
        message: `Duplicate process type "${processType}" in Procfile.`,
        serviceName: processType,
      });
      continue;
    }
    serviceNames.add(processType);

    if (isWorker) {
      // we can try to automatically infer config if that's Celery or Dramatiq CLIs,
      // and produce them in the output. Otherwise we'll fallback to a hint
      if (isWorkerCommand(tokens) && entrypoint?.endsWith('.py')) {
        services[processType] = {
          type: 'worker',
          entrypoint,
          runtime: 'python',
        };
      } else {
        emitWorkerHint(processType, command, entrypoint, warnings);
      }
      continue;
    }

    if (!detectedFramework && !entrypoint) {
      warnings.push({
        code: 'SERVICE_SKIPPED',
        message:
          `Skipped Procfile process "${processType}": no framework detected and could not ` +
          `infer entrypoint from command "${command}". Configure it manually in experimentalServices.`,
      });
      continue;
    }

    const serviceConfig: ExperimentalServiceConfig = { type: 'web' };

    if (detectedFramework) {
      serviceConfig.framework = detectedFramework.slug ?? undefined;
    }

    serviceConfig.entrypoint = entrypoint ?? '.';

    services[processType] = serviceConfig;
  }

  if (errors.length > 0) {
    return { services: null, errors, warnings };
  }

  if (Object.keys(services).length === 0) {
    return { services: null, errors: [], warnings };
  }

  // put release process into the web service's buildCommand,
  // this is the Heroku equivalent of a pre-deploy step
  if (releaseCommand && services.web) {
    services.web.buildCommand = releaseCommand;
  } else if (releaseCommand) {
    const firstService = Object.values(services)[0];
    if (firstService) {
      firstService.buildCommand = releaseCommand;
    }
  }

  warnings.push(...assignRoutePrefixes(services));

  return { services, errors: [], warnings };
}

function parseProcfile(content: string): ProcfileEntry[] {
  const entries: ProcfileEntry[] = [];

  for (const rawLine of content.split('\n')) {
    const match = rawLine.match(PROCFILE_LINE_RE);
    if (match) {
      entries.push({ processType: match[1], command: match[2].trim() });
    }
  }

  return entries;
}

async function extractEntrypoint(
  tokens: string[],
  fs: DetectorFilesystem
): Promise<string | undefined> {
  let firstModulePath: string | undefined;
  let lastFilePath: string | undefined;

  for (const token of tokens) {
    // first we try to infer python as module:attr entrypoint
    // and we take the first match. this way we can automatically
    // detect celery's app entrypoint when command is similar to
    // `celery -A myapp.celery worker` if we by accident have `worker.py`,
    // meanwhile it won't break on
    // `gunicorn --wsgi-app myapp.wsgi:app -c gunicorn.conf.py` or
    // `gunicorn -c gunicorn.conf.py myapp.wsgi:app` because
    // `gunicorn.conf.py` won't pass module existence check
    if (!firstModulePath && PY_MODULE_RE.test(token)) {
      const resolved = await resolvePythonModule(token, fs);
      if (resolved) firstModulePath = resolved;
    }

    // for files we take the last match, so we avoid flag values
    // like `--require ./setup.js` that might shadowing the real
    // entrypoint like `server.js`
    if (hasSupportedExtension(token)) {
      lastFilePath = token;
    }
  }

  return firstModulePath ?? lastFilePath;
}

/**
 * Try to resolve a Python module spec to a file path by checking the filesystem.
 * `a.b.c:d` -> checks `a/b/c.py` and then `a/b/c/__init__.py`.
 */
async function resolvePythonModule(
  spec: string,
  fs: DetectorFilesystem
): Promise<string | undefined> {
  const [modulePart] = spec.split(':');
  const filePath = `${modulePart.replace(/\./g, '/')}.py`;
  const initPath = `${modulePart.replace(/\./g, '/')}/__init__.py`;

  try {
    if (await fs.isFile(filePath)) return filePath;
    if (await fs.isFile(initPath)) return initPath;
  } catch {
    // we don't care about FS errors here,
    // we just want to check if paths exist and are accessible
  }
  return undefined;
}

function hasSupportedExtension(token: string): boolean {
  const dot = token.lastIndexOf('.');
  return dot > 0 && SUPPORTED_EXTENSIONS.has(token.slice(dot));
}

function isWorkerCommand(tokens: string[]): boolean {
  return tokens.some(t => SUPPORTED_WORKER_COMMANDS.has(baseCommand(t)));
}

function emitWorkerHint(
  processType: string,
  command: string,
  entrypoint: string | undefined,
  warnings: ServiceDetectionWarning[]
): void {
  const hint: Record<string, string> = {
    type: 'worker',
    entrypoint: entrypoint ?? '<path-to-handler>',
    runtime: 'python',
  };

  // if we couldn't infer worker automatically, then just produce a hint
  if (entrypoint?.endsWith('.py')) {
    warnings.push({
      code: 'PROCFILE_WORKER_HINT',
      message:
        `Found Procfile worker process "${processType}". ` +
        `Python workers that use Celery, Dramatiq and Django tasks are supported. ` +
        `You can add the following to define this worker:\n` +
        `"${processType}": ${JSON.stringify(hint, null, 2)}`,
    });
    return;
  }

  warnings.push({
    code: 'PROCFILE_WORKER_HINT',
    message:
      `Found Procfile worker process "${processType}" (command: "${command}"). ` +
      `Could not determine runtime. Only Python workers are currently supported.`,
  });
}

function baseCommand(token: string): string {
  if (!token) return '';
  const parts = token.split('/');
  return parts[parts.length - 1];
}

async function readProcfile(fs: DetectorFilesystem): Promise<{
  content: string | null;
  warning?: ServiceDetectionWarning;
}> {
  try {
    const exists = await fs.isFile(PROCFILE);
    if (!exists) return { content: null };

    const buf = await fs.readFile(PROCFILE);
    return { content: buf.toString('utf-8') };
  } catch (err) {
    return {
      content: null,
      warning: {
        code: 'PROCFILE_READ_ERROR',
        message: `Failed to read ${PROCFILE}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }
}
