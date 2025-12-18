import { join } from 'path';
import { debug, NowBuildError } from '@vercel/build-utils';
import execa from 'execa';

/**
 * Represents a Python API file that will be consolidated into a single Lambda.
 * This type mirrors the one in @vercel/fs-detectors to avoid circular dependencies.
 */
export interface PythonApiFile {
  path: string;
  route: string;
  type?: 'asgi' | 'wsgi' | 'http_handler' | 'unknown';
}

interface MetaAppConfig {
  files: Array<{ path: string; route: string }>;
  output: string;
}

/**
 * The filename for the consolidated Python API entry point.
 * This must match the `consolidatedEntrypoint` in detect-builders.ts.
 */
export const CONSOLIDATED_ENTRYPOINT = '__vc_python_api.py';

/**
 * Result of generating a meta-app.
 */
export interface MetaAppResult {
  /** The filename of the meta-app entry point */
  filename: string;
  /** The generated Python code content */
  content: string;
}

/**
 * Generate a consolidated meta-app that combines all Python API handlers
 * into a single Starlette application.
 *
 * This function runs the `meta_app_generator.py` script which:
 * 1. Parses each Python file to detect handler type (ASGI, WSGI, HTTP handler)
 * 2. Generates a Starlette app that mounts all handlers at their filesystem routes
 * 3. Wraps WSGI apps and HTTP handlers as ASGI-compatible endpoints
 *
 * The generated code is returned as a string (not written to disk) so it can
 * be added directly to the Lambda's files without polluting the user's workspace.
 *
 * @param options.pythonApiFiles - List of Python API files to consolidate
 * @param options.workPath - Working directory for the build
 * @param options.pythonPath - Path to the Python interpreter
 * @returns Object containing the filename and generated Python code
 */
export async function generateMetaApp(options: {
  pythonApiFiles: PythonApiFile[];
  workPath: string;
  pythonPath: string;
}): Promise<MetaAppResult> {
  const { pythonApiFiles, workPath, pythonPath } = options;
  const generatorPath = join(__dirname, '..', 'lib', 'meta_app_generator.py');

  // Use "-" as output to signal the generator to write to stdout
  const config: MetaAppConfig = {
    files: pythonApiFiles.map(f => ({
      path: f.path,
      route: f.route,
    })),
    output: '-',
  };

  debug(`Generating meta-app with ${pythonApiFiles.length} handlers...`);
  debug(`Generator path: ${generatorPath}`);
  debug(`Config: ${JSON.stringify(config, null, 2)}`);

  try {
    const result = await execa(
      pythonPath,
      [generatorPath, JSON.stringify(config)],
      {
        cwd: workPath,
      }
    );
    debug(`Meta-app generated (${result.stdout.length} bytes)`);
    return {
      filename: CONSOLIDATED_ENTRYPOINT,
      content: result.stdout,
    };
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    throw new NowBuildError({
      code: 'META_APP_GENERATION_FAILED',
      message: `Failed to generate consolidated Python API: ${error.stderr || error.message}`,
    });
  }
}

/**
 * Get the runtime dependencies needed for consolidated API mode.
 * These are added to the base runtime dependencies to enable the meta-app.
 */
export function getConsolidatedApiDependencies(): string[] {
  return ['starlette>=0.27.0', 'uvicorn>=0.24'];
}
