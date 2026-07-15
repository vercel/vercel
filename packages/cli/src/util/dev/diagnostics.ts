import { defineDiagnostics, Diagnostic } from 'nostics';
import { NowBuildError } from '@vercel/build-utils';
import ms from 'ms';

const REPORT_A_BUG =
  'This is likely a bug in the Vercel CLI. Please report it at https://vercel.com/help.';

const REPORT_A_BUILDER_BUG =
  "This is likely a bug in the Builder that produced this function. Report it to the Builder's author, or at https://vercel.com/help for an official `@vercel/*` Builder.";

/**
 * Structured diagnostic codes for errors used by `vc dev`.
 */
export const dev = defineDiagnostics({
  codes: {
    DEV_RECURSIVE_INVOCATION: {
      why: '`vercel dev` must not recursively invoke itself',
      fix: 'Check the Development Command in your Project Settings and the `dev` script in `package.json` — neither should call `vercel dev`.',
      docs: 'https://vercel.link/recursive-invocation-of-commands',
    },
    DEV_LOCK_HELD: {
      why: 'Another `vercel dev` process is already running for this project',
      fix: (p: { detail: string }) => p.detail,
    },

    DEV_INVALID_WINDOWS_PIPE: {
      why: (p: { endpoint: string }) =>
        `Invalid Windows named pipe endpoint: ${p.endpoint}`,
      fix: 'Use a pipe path beginning with `\\\\.\\`, e.g. `pipe:\\\\.\\pipe\\my-app`.',
    },
    DEV_INVALID_UNIX_SOCKET: {
      why: (p: { endpoint: string }) =>
        `Invalid UNIX domain socket endpoint: ${p.endpoint}`,
      fix: 'Provide a socket path, e.g. `unix:/tmp/my-app.sock`.',
    },
    DEV_INVALID_LISTEN_SCHEME: {
      why: (p: { protocol: string | null }) =>
        `Unknown \`--listen\` scheme (protocol): ${p.protocol}`,
      fix: 'Use a port (e.g. `3000`), or a `tcp:`, `unix:`, or `pipe:` endpoint.',
    },

    DEV_PORT_DETECTION_TIMED_OUT: {
      why: (p: { port: number; timeout: number }) =>
        `Detecting port ${p.port} timed out after ${ms(p.timeout)}`,
      fix: 'Ensure your Development Command starts a server that listens on the expected port.',
    },

    DEV_BUILDER_LOAD_FAILED: {
      why: (p: { use: string }) => `Failed to load Builder "${p.use}"`,
      fix: 'Check that the Builder is installed and spelled correctly in your `vercel.json` `builds` configuration.',
    },
    DEV_SIDECAR_UNSUPPORTED_TYPE: {
      why: (p: { name: string; type: string }) =>
        `Development sidecar "${p.name}" has unsupported type "${p.type}"`,
      fix: REPORT_A_BUILDER_BUG,
    },
    DEV_SIDECAR_DUPLICATE_NAME: {
      why: (p: { name: string }) =>
        `Multiple builders contributed a development sidecar named "${p.name}"`,
      fix: REPORT_A_BUILDER_BUG,
    },

    DEV_QUEUE_CONSUMER_DUPLICATE: {
      why: (p: { consumerGroup: string; topic: string }) =>
        `Queue consumer "${p.consumerGroup}" is configured more than once for topic "${p.topic}"`,
      fix: 'Remove the duplicate consumer configuration so each consumer subscribes to a topic only once.',
    },

    DEV_SERVICE_NO_DEV_SERVER: {
      why: (p: { name: string; framework: string }) =>
        `No dev server available for service "${p.name}" (framework: ${p.framework})`,
      fix: 'Add a Development Command for this service, or set its framework so one can be detected.',
    },
    DEV_SERVICE_NO_PID: {
      why: (p: { name: string }) =>
        `Failed to start service "${p.name}": no PID returned`,
      fix: 'Verify the service Development Command is executable and starts successfully.',
    },
    DEV_SERVICE_NO_STDIO: {
      why: (p: { name: string }) =>
        `Failed to start service "${p.name}": expected child process to have stdout and stderr`,
      fix: REPORT_A_BUG,
    },

    DEV_BUILDER_RESULT_NOT_LAMBDA: {
      why: 'The result of "builder.build()" must be a `Lambda`',
      fix: REPORT_A_BUILDER_BUG,
    },
    DEV_BUILDER_RESULT_HAS_MAXDURATION: {
      why: 'The result of "builder.build()" must not contain `maxDuration`',
      fix: REPORT_A_BUILDER_BUG,
    },
    DEV_BUILDER_RESULT_HAS_MEMORY: {
      why: 'The result of "builder.build()" must not contain `memory`',
      fix: REPORT_A_BUILDER_BUG,
    },
    DEV_UNSUPPORTED_BUILDER_VERSION: {
      why: (p: { titleName: string; version: string | number }) =>
        `${p.titleName} CLI does not support builder version ${p.version}`,
      fix: (p: { updateCommand: string }) =>
        `Please run \`${p.updateCommand}\` to update to the latest CLI.`,
    },
    // These routes were emitted by the Builder, not authored directly.
    DEV_INVALID_ROUTES: {
      why: (p: { message: string }) => p.message,
      fix: REPORT_A_BUILDER_BUG,
    },

    DEV_LISTEN_ADDRESS_IN_USE: {
      why: (p: { address: string }) =>
        `Requested socket ${p.address} is already in use`,
      fix: 'Stop the process using that socket, or pass a different `--listen` address.',
    },
    DEV_UNSUPPORTED_CONFIG_VERSION: {
      why: 'Cannot run `version: 1` projects',
      fix: 'Upgrade the project to the current configuration — remove `"version": 1` from your `vercel.json`.',
    },
    DEV_CWD_NOT_FOUND: {
      why: (p: { cwd: string }) => `Directory \`${p.cwd}\` does not exist`,
      fix: 'Run the command from an existing directory, or pass a valid path.',
    },
    DEV_CWD_NOT_DIRECTORY: {
      why: (p: { cwd: string }) => `Path \`${p.cwd}\` is not a directory`,
      fix: 'Point the command at a directory rather than a file.',
    },
    DEV_INTERNAL_ADDRESS_UNAVAILABLE: {
      why: 'Invalid access to `address` because `start` has not yet populated `this.address`',
      fix: REPORT_A_BUG,
    },
    DEV_INTERNAL_NO_ROUTE_RESULT: {
      why: 'Expected Route Result but none was found',
      fix: REPORT_A_BUG,
    },
    DEV_INTERNAL_MISSING_CHILD_STDIO: {
      why: 'Expected child process to have stdout and stderr',
      fix: REPORT_A_BUG,
    },

    // Boundary bucket: every OS syscall failure wrapped by `toDiagnostic` collapses here
    DEV_SYSCALL_ERROR: {
      why: (p: { message: string }) => p.message,
      fix: 'This is an operating-system error. Check the file path, permissions, and ports referenced above, then retry.',
    },
  },
});

// For errors raised by packages other than the CLI will try to attach
// a fix to using wrapped codes
const FIX_BY_CODE: Record<string, string> = {
  // `@vercel/fs-detectors` emits the lowercase code during zero-config detection.
  missing_build_script:
    'Add a `build` script to your `package.json`, or set a Build Command in your Project Settings.',
  MISSING_DOTENV_VARS:
    'Define the missing variables in your `.env` file, or pull them with `vercel env pull`.',
  MAX_LAMBDA_SIZE_EXCEEDED:
    'Reduce the function bundle — trim dependencies or included files, or split the function.',
  NODE_DEPENDENCY_SYNC_FAILED:
    'Install your dependencies (e.g. `npm install`) and confirm they resolve, then retry.',
  INSTALL_COMMAND_FAILED: 'Fix the dependency error logged above, then retry.',
  CONFLICTING_CONFIG_FILES:
    'Keep a single configuration file — remove the extra `vercel.json`/`now.json`.',
  CANT_PARSE_JSON_FILE:
    'Fix the JSON syntax error at the location shown above, then retry.',
};

/**
 * Wrap an arbitrary error caught at the `vercel dev` boundary into a
 * nostics error so it renders consistently and carries a stable code.
 */
export function toDiagnostic(err: unknown): Diagnostic {
  if (err instanceof Diagnostic) {
    return err;
  }

  const source = err as {
    code?: unknown;
    errno?: unknown;
    syscall?: unknown;
    link?: unknown;
    action?: unknown;
    message?: unknown;
    name?: unknown;
  };

  const why =
    err instanceof Error
      ? err.message
      : typeof source.message === 'string'
        ? source.message
        : String(err);

  // OS syscall errors
  if (typeof source.errno === 'number' || typeof source.syscall === 'string') {
    return dev.DEV_SYSCALL_ERROR({ message: why, cause: err });
  }

  const code = typeof source.code === 'string' ? source.code : undefined;
  const docs = typeof source.link === 'string' ? source.link : undefined;
  // `NowBuildError` can carry a custom call-to-action label (e.g. "View
  // Documentation") to show before its link. Preserve it so wrapping doesn't
  // downgrade every link to the generic "Learn More".
  const action = typeof source.action === 'string' ? source.action : undefined;
  const fix = code ? FIX_BY_CODE[code] : undefined;

  const diagnostic = new Diagnostic({ why, fix, docs, cause: err });
  if (code) {
    diagnostic.name = code;
  }
  if (action) {
    // `action` is monkey-patched on, so it renders via `prettyError`
    // but is NOT included in `toJSON()`.
    (diagnostic as Diagnostic & { action?: string }).action = action;
  }
  return diagnostic;
}

/**
 *  When a user's Development Command dies, the CLI must exit with the *same* code the command returned
 *  (e.g. `127`), not a generic `1`. A catalog code has no way to carry that,
 *  and the exit site needs an `instanceof` check to know which code to use.
 */
export class DevCommandExitError extends Diagnostic {
  exitCode: number;

  constructor(message: string, exitCode: number) {
    super({
      why: message,
      fix: 'Your Development Command exited before the dev server was ready. Fix the error logged above, then confirm the command runs on its own (e.g. `npm run dev`).',
    });
    this.name = 'DEV_COMMAND_EXITED';
    this.exitCode = exitCode;
  }
}

/**
 * Aggregates *many* per-service failures, so the error
 *  construction logic goes over a list of errors, not a single templated string.
 */
export class ServiceStartError extends Diagnostic {
  readonly childCodes: string[];

  constructor(failures: Error[]) {
    // Deduplicate errors that are the same for all services
    const dedupeErrorCodes = new Set(['PYTHON_EXTERNAL_VENV_DETECTED']);
    const seenCodes = new Set<string>();
    const uniqueMessages: string[] = [];
    const childFixes: string[] = [];
    const childCodes: string[] = [];

    for (const err of failures) {
      const message = err instanceof Error ? err.message : String(err);
      const rawCode = (err as { code?: unknown })?.code;
      const code =
        err instanceof NowBuildError
          ? err.code
          : typeof rawCode === 'string'
            ? rawCode
            : undefined;

      if (code && dedupeErrorCodes.has(code)) {
        if (!seenCodes.has(code)) {
          uniqueMessages.push(message);
          seenCodes.add(code);
        }
      } else {
        uniqueMessages.push(message);
      }

      if (code && !childCodes.includes(code)) {
        childCodes.push(code);
      }

      const childFix = code ? FIX_BY_CODE[code] : undefined;
      if (childFix && !childFixes.includes(childFix)) {
        childFixes.push(childFix);
      }
    }

    super({
      why: uniqueMessages.join('\n'),
      fix: childFixes.length
        ? childFixes.join('\n')
        : 'Review the per-service errors above and fix each failing service before retrying.',
    });
    this.name = 'DEV_SERVICE_START_FAILED';
    this.childCodes = childCodes;
  }
}

export function telemetryCodes(diagnostic: Diagnostic): string[] {
  if (diagnostic instanceof ServiceStartError && diagnostic.childCodes.length) {
    return diagnostic.childCodes;
  }
  return [diagnostic.name];
}
