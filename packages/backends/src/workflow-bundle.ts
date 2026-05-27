import { type Files, FileBlob, debug } from '@vercel/build-utils';
import { build as rolldownBuild, type Plugin } from 'rolldown';
import { createRequire, builtinModules } from 'node:module';
import { join, relative, extname } from 'node:path';

const WORKFLOW_BUNDLE_FILENAME = '__vc_workflow_bundle.cjs';
const WORKFLOW_RUNTIME_FILENAME = '__vc_workflow_runtime.cjs';

/**
 * Build the workflow code into a single CJS bundle suitable for VM execution.
 *
 * The workflow runtime (`workflowEntrypoint`) evaluates the bundled source
 * string inside a `vm.runInContext()` call. Because the VM context does not
 * have `require()`, every dependency must be inlined. The SWC `@workflow`
 * plugin transforms `"use workflow"` and `"use step"` directives so that
 * workflow functions are registered on `globalThis.__private_workflows`.
 *
 * This mirrors the `BaseBuilder.createWorkflowsBundle()` method in the
 * `@workflow/builders` package but uses rolldown instead of esbuild and
 * loads the SWC toolchain from the user's project.
 */
export async function buildWorkflowBundle(args: {
  entrypoint: string;
  workPath: string;
  repoRootPath: string;
}): Promise<{ files: Files; bundlePath: string }> {
  const { entrypoint, workPath } = args;

  // Dynamically load the SWC transform from the user's node_modules.
  // The `@workflow/builders` package provides `applySwcTransform` which
  // handles the SWC plugin resolution and transformation.
  const userRequire = createRequire(join(workPath, 'package.json'));

  let applySwcTransform: (
    filename: string,
    source: string,
    mode: string,
    absolutePath?: string,
    projectRoot?: string
  ) => Promise<{ code: string; workflowManifest: Record<string, unknown> }>;

  try {
    const builders = userRequire('@workflow/builders');
    applySwcTransform = builders.applySwcTransform;
  } catch {
    throw new Error(
      'Workflow-triggered job services require the "workflow" package. ' +
        'Install it with: npm install workflow'
    );
  }

  const swcTransformPlugin = (): Plugin => ({
    name: 'workflow:swc-transform',
    async transform(code, id) {
      // Only transform user source files, not node_modules
      if (id.includes('node_modules')) return null;

      const ext = extname(id);
      const transformable = [
        '.ts',
        '.tsx',
        '.mts',
        '.cts',
        '.js',
        '.jsx',
        '.mjs',
        '.cjs',
      ];
      if (!transformable.includes(ext)) return null;

      // Compute relative filename (the SWC plugin uses it to generate workflowId)
      const relFilename = relative(workPath, id).replace(/\\/g, '/');

      try {
        const result = await applySwcTransform(
          relFilename,
          code,
          'workflow',
          id,
          workPath
        );
        return { code: result.code };
      } catch (err) {
        debug(
          `SWC transform failed for ${id}: ${err instanceof Error ? err.message : String(err)}`
        );
        return null;
      }
    },
  });

  // Plugin that bundles everything inline — no externals except Node builtins.
  // The VM context does not have `require()` so every dependency must be
  // resolved and inlined at build time.
  const inlineAllPlugin = (): Plugin => ({
    name: 'workflow:inline-all',
    resolveId: {
      order: 'pre',
      async handler(id) {
        // Node builtins must stay external — they are available in the VM
        // context via the sandbox's `require` shim.
        const normalizedId = id.includes(':') ? id.split(':')[1] : id;
        if (builtinModules.includes(normalizedId)) {
          return {
            id: id.startsWith('node:') ? id : `node:${id}`,
            external: true,
          };
        }

        // Let rolldown resolve everything else (including node_modules).
        return null;
      },
    },
  });

  const out = await rolldownBuild({
    input: entrypoint,
    write: false,
    cwd: workPath,
    platform: 'neutral',
    plugins: [swcTransformPlugin(), inlineAllPlugin()],
    resolve: {
      conditionNames: ['workflow', 'import', 'require', 'default'],
    },
    output: {
      format: 'cjs',
      entryFileNames: WORKFLOW_BUNDLE_FILENAME,
      // Single file — do not preserve module structure.
      sourcemap: 'inline',
      banner: 'globalThis.__private_workflows = new Map();',
    },
  });

  let bundleCode: string | null = null;
  for (const file of out.output) {
    if (file.type === 'chunk' && file.isEntry) {
      bundleCode = file.code;
    }
  }

  if (!bundleCode) {
    throw new Error(
      `Failed to build workflow bundle for entrypoint: ${entrypoint}`
    );
  }

  // Also bundle `workflow/runtime` into a self-contained CJS file.
  // The dispatch shim needs `createWorld`, `setWorld`, and
  // `workflowEntrypoint` at runtime. Rather than relying on
  // node_modules being present in the lambda (which nft may not
  // include properly), we bundle the runtime and all its deps.
  let runtimeCode: string | null = null;
  try {
    const userRequire = createRequire(join(workPath, 'package.json'));
    const runtimeEntry = userRequire.resolve('workflow/runtime');

    const runtimeOut = await rolldownBuild({
      input: runtimeEntry,
      write: false,
      cwd: workPath,
      platform: 'node',
      plugins: [inlineAllPlugin()],
      resolve: {
        conditionNames: ['import', 'require', 'default'],
      },
      output: {
        format: 'cjs',
        entryFileNames: WORKFLOW_RUNTIME_FILENAME,
        exports: 'named',
        sourcemap: 'inline',
      },
    });

    for (const file of runtimeOut.output) {
      if (file.type === 'chunk' && file.isEntry) {
        runtimeCode = file.code;
      }
    }
  } catch (err) {
    debug(
      `Failed to bundle workflow/runtime: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const files: Files = {
    [WORKFLOW_BUNDLE_FILENAME]: new FileBlob({
      data: bundleCode,
      mode: 0o644,
    }),
  };

  if (runtimeCode) {
    files[WORKFLOW_RUNTIME_FILENAME] = new FileBlob({
      data: runtimeCode,
      mode: 0o644,
    });
  }

  return {
    bundlePath: WORKFLOW_BUNDLE_FILENAME,
    runtimeBundlePath: runtimeCode ? WORKFLOW_RUNTIME_FILENAME : undefined,
    files,
  };
}
