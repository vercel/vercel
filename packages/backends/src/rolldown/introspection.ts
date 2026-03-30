import type { BuildOptions, Files, Span } from '@vercel/build-utils';
import {
  debug,
  FileBlob,
  isExperimentalBackendsWithoutIntrospectionEnabled,
} from '@vercel/build-utils';
import { spawn } from 'node:child_process';
import { isAbsolute, join, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  createWriteStream,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import {
  BEGIN_INTROSPECTION_RESULT,
  END_INTROSPECTION_RESULT,
} from './util.js';

const require = createRequire(import.meta.url);

export interface IntrospectionResult {
  routes: Array<{
    src: string;
    dest: string;
    methods: string[];
  }>;
  additionalFolders: string[];
  additionalDeps: string[];
}

const introspectionSchema = z.object({
  routes: z.array(
    z.object({
      src: z.string(),
      dest: z.string(),
      methods: z.array(z.string()),
    })
  ),
  additionalFolders: z.array(z.string()).optional(),
  additionalDeps: z.array(z.string()).optional(),
});

export const introspection = async (
  args: BuildOptions & { span: Span; files: Files; handler: string }
): Promise<IntrospectionResult> => {
  const defaultResult: IntrospectionResult = {
    routes: [],
    additionalFolders: [],
    additionalDeps: [],
  };

  if (isExperimentalBackendsWithoutIntrospectionEnabled()) {
    return defaultResult;
  }

  const introspectionSpan = args.span.child(
    'vc.builder.backends.introspection'
  );

  const runIntrospection = async (): Promise<IntrospectionResult> => {
    const rolldownEsmLoaderPath = `file://${require.resolve(
      '@vercel/backends/rolldown/esm'
    )}`;
    const rolldownCjsLoaderPath = require.resolve(
      '@vercel/backends/rolldown/cjs-hooks'
    );
    const handlerPath = join(args.workPath, args.entrypoint);
    const files = args.files;
    const tmpDir = mkdtempSync(join(tmpdir(), 'vercel-introspection-'));

    // Only write FileBlob files (built code), not FileFsRef files (traced deps)
    for (const [key, value] of Object.entries(files)) {
      if (!(value instanceof FileBlob) || typeof value.data !== 'string') {
        continue;
      }
      const filePath = join(tmpDir, key);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, value.data);
    }

    let introspectionData: z.infer<typeof introspectionSchema> | undefined;

    await new Promise<void>(resolvePromise => {
      try {
        debug('Spawning introspection process');

        // Create a temporary file to capture stdout
        const outputTempDir = mkdtempSync(
          join(tmpdir(), 'introspection-output-')
        );
        const tempFilePath = join(outputTempDir, 'output.txt');
        const writeStream = createWriteStream(tempFilePath);
        let streamClosed = false;

        const child = spawn(
          'node',
          [
            '-r',
            rolldownCjsLoaderPath,
            '--import',
            rolldownEsmLoaderPath,
            handlerPath,
          ],
          {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: args.workPath,
            env: {
              ...process.env,
              ...args.meta?.buildEnv,
              ...args.meta?.env,
              VERCEL_INTROSPECTION_HANDLER: handlerPath,
              VERCEL_INTROSPECTION_HANDLER_BUILT: args.handler,
              VERCEL_INTROSPECTION_WORK_PATH: args.workPath,
              VERCEL_INTROSPECTION_REPO_ROOT_PATH: args.repoRootPath,
              VERCEL_INTROSPECTION_TMP_DIR: tmpDir,
            },
          }
        );

        // Pipe stdout to the file stream
        child.stdout?.pipe(writeStream);

        // Capture stderr for debugging
        let stderrBuffer = '';
        child.stderr?.on('data', (data: Buffer) => {
          stderrBuffer += data.toString();
        });

        writeStream.on('error', err => {
          debug(`Write stream error: ${err.message}`);
        });

        const timeout = setTimeout(() => {
          debug('Introspection timeout, killing process with SIGTERM');
          child.kill('SIGTERM');
        }, 8000);
        const timeout2 = setTimeout(() => {
          debug('Introspection timeout, killing process with SIGKILL');
          child.kill('SIGKILL');
        }, 9000);

        const cleanup = () => {
          clearTimeout(timeout);
          clearTimeout(timeout2);
          // Clean up the built files temp dir
          try {
            rmSync(tmpDir, { recursive: true, force: true });
          } catch (err) {
            debug(`Error deleting tmpDir: ${err}`);
          }
        };

        child.on('error', err => {
          cleanup();
          debug(`Loader error: ${err.message}`);
          if (!streamClosed) {
            writeStream.end(() => {
              streamClosed = true;
              try {
                rmSync(outputTempDir, { recursive: true, force: true });
              } catch (cleanupErr) {
                debug(`Error deleting output temp dir: ${cleanupErr}`);
              }
              resolvePromise();
            });
          } else {
            resolvePromise();
          }
        });

        child.on('close', () => {
          cleanup();
          debug('Introspection process closed');

          if (!streamClosed) {
            writeStream.end(() => {
              streamClosed = true;
              let stdoutBuffer: string | undefined;
              try {
                stdoutBuffer = readFileSync(tempFilePath, 'utf8');

                // Check if we have a complete introspection result
                const beginIndex = stdoutBuffer.indexOf(
                  BEGIN_INTROSPECTION_RESULT
                );
                const endIndex = stdoutBuffer.indexOf(END_INTROSPECTION_RESULT);

                if (beginIndex !== -1 && endIndex !== -1) {
                  const introspectionString = stdoutBuffer.substring(
                    beginIndex + BEGIN_INTROSPECTION_RESULT.length,
                    endIndex
                  );

                  if (introspectionString) {
                    introspectionData = introspectionSchema.parse(
                      JSON.parse(introspectionString)
                    );
                    debug('Introspection data parsed successfully');
                  }
                } else {
                  debug(
                    `Introspection markers not found.\nstdout:\n${stdoutBuffer}\nstderr:\n${stderrBuffer}`
                  );
                }
              } catch (error) {
                debug(
                  `Error parsing introspection data: ${error}\nstdout:\n${stdoutBuffer}\nstderr:\n${stderrBuffer}`
                );
              } finally {
                // Clean up the output temp directory
                try {
                  rmSync(outputTempDir, { recursive: true, force: true });
                } catch (err) {
                  debug(`Error deleting output temp directory: ${err}`);
                }
                resolvePromise();
              }
            });
          } else {
            resolvePromise();
          }
        });
      } catch (error) {
        debug('Introspection error', error);
        resolvePromise();
      }
    });

    if (!introspectionData) {
      introspectionSpan.setAttributes({
        'introspection.success': 'false',
        'introspection.routes': '0',
      });
      return defaultResult;
    }

    // Transform absolute paths to relative
    const additionalFolders = (introspectionData.additionalFolders ?? []).map(
      val => {
        if (isAbsolute(val)) {
          return relative(args.workPath, val);
        }
        return val;
      }
    );

    introspectionSpan.setAttributes({
      'introspection.success': 'true',
      'introspection.routes': String(introspectionData.routes.length),
    });

    return {
      routes: introspectionData.routes,
      additionalFolders,
      additionalDeps: introspectionData.additionalDeps ?? [],
    };
  };

  return introspectionSpan.trace(runIntrospection);
};
