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
  join(TEMPLATES_DIR, 'vc_workflow_dispatch.mjs'),
  'utf-8'
);
const CJS_TEMPLATE = readFileSync(
  join(TEMPLATES_DIR, 'vc_workflow_dispatch.cjs'),
  'utf-8'
);

const BUNDLE_PATH_PLACEHOLDER = /['"]__VC_WORKFLOW_BUNDLE_PATH__['"]/g;
const RUNTIME_PATH_PLACEHOLDER = /['"]__VC_WORKFLOW_RUNTIME_PATH__['"]/g;

/**
 * Wrap a workflow service with a dispatcher shim that:
 *   - reads the pre-built workflow bundle (a CJS string for VM execution)
 *   - loads the pre-bundled workflow runtime via require()
 *   - calls `workflowEntrypoint(bundleCode)` to get a Web API handler
 *   - adapts it to the Node.js `(req, res)` signature the lambda expects
 *
 * The dispatcher source lives in `templates/vc_workflow_dispatch.{mjs,cjs}`.
 */
export async function applyWorkflowDispatch(args: {
  files: Files;
  /** Path of the current lambda handler produced by rolldown. */
  handler: string;
  workPath: string;
  /** Relative path to the workflow bundle file inside the lambda files map. */
  workflowBundlePath: string;
  /** Relative path to the bundled workflow runtime file. */
  runtimeBundlePath?: string;
}): Promise<{ files: Files; handler: string }> {
  const { format, extension } = await resolveShimFormat(args);

  // Use POSIX path utilities — lambda `files` map keys are always
  // forward-slash separated regardless of build host OS.
  const handlerDir = posix.dirname(args.handler);
  const handlerBaseName = posix.basename(args.handler, extname(args.handler));
  const dispatchName = `${handlerBaseName}.__vc_workflow_dispatch${extension}`;
  const dispatchHandler =
    handlerDir === '.' ? dispatchName : posix.join(handlerDir, dispatchName);

  // Compute the relative path from the dispatch shim to the workflow bundle.
  const dispatchDir = posix.dirname(dispatchHandler);
  const bundleRelative =
    dispatchDir === '.'
      ? args.workflowBundlePath
      : posix.relative(dispatchDir, args.workflowBundlePath);

  // Compute the relative path from the dispatch shim to the runtime bundle.
  const runtimePath = args.runtimeBundlePath || 'workflow/runtime';
  const runtimeRelative =
    args.runtimeBundlePath && dispatchDir !== '.'
      ? posix.relative(dispatchDir, args.runtimeBundlePath)
      : runtimePath;

  const template = format === 'esm' ? ESM_TEMPLATE : CJS_TEMPLATE;
  const dispatchSource = template
    .replace(BUNDLE_PATH_PLACEHOLDER, JSON.stringify(bundleRelative))
    .replace(RUNTIME_PATH_PLACEHOLDER, JSON.stringify(runtimeRelative));

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
    defaultFormat: 'cjs',
  });
  const extension =
    extname(args.handler) || (format === 'esm' ? '.mjs' : '.cjs');
  return { format, extension };
}
