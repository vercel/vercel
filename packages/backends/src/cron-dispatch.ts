import { FileBlob, type Files } from '@vercel/build-utils';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEntrypointAndFormat } from './rolldown/resolve-format.js';

type ModuleFormat = 'esm' | 'cjs';

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'templates'
);

const ESM_TEMPLATE = readFileSync(
  join(TEMPLATES_DIR, 'vc_cron_dispatch.mjs'),
  'utf-8'
);
const CJS_TEMPLATE = readFileSync(
  join(TEMPLATES_DIR, 'vc_cron_dispatch.cjs'),
  'utf-8'
);

const USER_MODULE_PLACEHOLDER = /['"]__VC_USER_MODULE_PATH__['"]/g;
const ROUTES_PLACEHOLDER = /'__VC_ROUTES_JSON__'/g;

/**
 * Wrap a cron service handler with a dispatcher shim that:
 *   - looks up the inbound request path in a route table baked into the
 *     shim at build time and invokes the named export on the user module
 *     (or the default export when the table value is `"default"`)
 *   - verifies `CRON_SECRET` via `Authorization: Bearer ...` when set
 *
 * The dispatcher source lives in templates/vc_cron_dispatch.{mjs,cjs};
 * this function picks the right template, swaps in the user module
 * import path and the cron route table, and writes the result into the
 * lambda files.
 *
 * The route table is embedded inline rather than passed via a lambda
 * env var because AWS Lambda rejects env var names that don't start
 * with a letter — `__VC_CRON_ROUTES` would fail at deploy time. The
 * Python builder works around the same constraint by writing the route
 * table into its trampoline source.
 */
export async function applyCronDispatch(args: {
  files: Files;
  handler: string;
  workPath: string;
  /** Cron path → handler-function-name on the user module. */
  routes: Record<string, string>;
  /**
   * Optional override for the string the shim uses to import the user
   * module. Defaults to the lambda-bundle relative `./<basename>` form.
   * Callers (e.g. `startDevServer`) that host the shim outside the
   * lambda bundle pass an absolute path or `file://` URL.
   */
  modulePathOverride?: string;
}): Promise<{ files: Files; handler: string }> {
  const { format, extension } = await resolveShimFormat(args);
  // Use POSIX path utilities — lambda `files` map keys are always
  // forward-slash separated regardless of build host OS.
  const handlerDir = posix.dirname(args.handler);
  const handlerBaseName = posix.basename(args.handler, extname(args.handler));
  const dispatchName = `${handlerBaseName}.__vc_cron_dispatch${extension}`;
  const dispatchHandler =
    handlerDir === '.' ? dispatchName : posix.join(handlerDir, dispatchName);

  const handlerImportPath =
    args.modulePathOverride ?? `./${posix.basename(args.handler)}`;

  // Single-quote the route JSON so embedded double quotes don't need
  // escaping. Cron paths and handler names only contain
  // [a-zA-Z0-9_./:-] so JSON.stringify won't produce backslashes — but
  // assert defensively so any future change that introduces them
  // surfaces here rather than at runtime.
  const routesJson = JSON.stringify(args.routes);
  if (routesJson.includes('\\') || routesJson.includes("'")) {
    throw new Error(
      `cron route table contains characters that need JS-string escaping: ${routesJson}`
    );
  }

  const template = format === 'esm' ? ESM_TEMPLATE : CJS_TEMPLATE;
  const dispatchSource = template
    .replace(USER_MODULE_PLACEHOLDER, JSON.stringify(handlerImportPath))
    .replace(ROUTES_PLACEHOLDER, `'${routesJson}'`);

  return {
    handler: dispatchHandler,
    files: {
      ...args.files,
      [dispatchHandler]: new FileBlob({
        data: dispatchSource,
        mode: 0o644,
      }),
    },
  };
}

async function resolveShimFormat(args: {
  handler: string;
  workPath: string;
}): Promise<{ format: ModuleFormat; extension: string }> {
  const { format } = await resolveEntrypointAndFormat({
    entrypoint: args.handler,
    workPath: args.workPath,
    // Cron-service users may have a tiny project with just an entrypoint
    // and a vercel.json, but no package.json. Node would treat that file
    // as CJS and we should too.
    defaultFormat: 'cjs',
  });
  const extension =
    extname(args.handler) || (format === 'esm' ? '.mjs' : '.cjs');
  return { format, extension };
}
