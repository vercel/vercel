import { FileBlob, type Files } from '@vercel/build-utils';
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
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

/**
 * Wrap a cron service handler with a dispatcher shim that:
 *   - reads `__VC_CRON_ROUTES` (JSON: cron path → handler-function name)
 *   - verifies `CRON_SECRET` via `Authorization: Bearer ...` when set
 *   - looks up the inbound request path in the route table and invokes
 *     the named export on the user module (or the default export when
 *     the table value is `"default"`)
 *
 * The dispatcher source lives in templates/vc_cron_dispatch.{mjs,cjs};
 * this function only picks the right template, swaps in the user module
 * import path, and writes the result into the lambda files.
 */
export async function applyCronDispatch(args: {
  files: Files;
  handler: string;
  workPath: string;
}): Promise<{ files: Files; handler: string }> {
  const { format, extension } = await resolveShimFormat(args);
  const handlerDir = dirname(args.handler);
  const handlerBaseName = basename(args.handler, extname(args.handler));
  const dispatchName = `${handlerBaseName}.__vc_cron_dispatch${extension}`;
  const dispatchHandler =
    handlerDir === '.' ? dispatchName : join(handlerDir, dispatchName);

  const handlerImportPath = `./${basename(args.handler)}`;
  const template = format === 'esm' ? ESM_TEMPLATE : CJS_TEMPLATE;
  const dispatchSource = template.replace(
    USER_MODULE_PLACEHOLDER,
    JSON.stringify(handlerImportPath)
  );

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
  });
  const extension =
    extname(args.handler) || (format === 'esm' ? '.mjs' : '.cjs');
  return { format, extension };
}
