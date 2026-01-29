import { dirname, isAbsolute, join, relative } from 'node:path';
import {
  existsSync,
  createWriteStream,
  readFileSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import {
  debug,
  isExperimentalBackendsWithoutIntrospectionEnabled,
} from '@vercel/build-utils';
import {
  BEGIN_INTROSPECTION_RESULT,
  END_INTROSPECTION_RESULT,
} from './util.js';

const require = createRequire(import.meta.url);

export const introspectApp = async (args: {
  dir: string;
  handler: string;
  framework: string | null | undefined;
  env: Record<string, string | undefined>;
}) => {
  if (isExperimentalBackendsWithoutIntrospectionEnabled()) {
    return defaultResult(args);
  }
  const cjsLoaderPath = new URL('loaders/cjs.cjs', import.meta.url).pathname;
  const rolldownEsmLoaderPath = new URL(
    'loaders/rolldown-esm.mjs',
    import.meta.url
  ).href;
  const handlerPath = join(args.dir, args.handler);

  const introspectionSchema = z.object({
    frameworkSlug: z.string().optional(),
    routes: z.array(
      z.object({
        src: z.string(),
        dest: z.string(),
        methods: z.array(z.string()),
      })
    ),
    additionalFolders: z
      .array(z.string())
      .optional()
      .transform(values => {
        // if is absolute, make relative to dir
        return values?.map(val => {
          if (isAbsolute(val)) {
            return relative(args.dir, val);
          }
          // else, assume relative to dir
          return val;
        });
      }),
    additionalDeps: z.array(z.string()).optional(),
  });
  let introspectionData: z.infer<typeof introspectionSchema> | undefined;

  await new Promise(resolvePromise => {
    try {
      // Use spawn to support different runtimes (node, bun, etc.)
      debug('Spawning introspection process');
      const child = spawn(
        'node',
        ['-r', cjsLoaderPath, '--import', rolldownEsmLoaderPath, handlerPath],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: args.dir,
          env: {
            ...process.env,
            ...args.env,
          },
        }
      );

      // Create a temporary directory with secure permissions (0700)
      // mkdtemp creates the directory with mode 0700 by default (owner rwx only)
      const tempDir = mkdtempSync(join(tmpdir(), 'introspection-'));
      const tempFilePath = join(tempDir, 'output.txt');
      const writeStream = createWriteStream(tempFilePath);
      let streamClosed = false;

      // Pipe stdout to the file stream
      child.stdout?.pipe(writeStream);

      // Capture stderr
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

      child.on('error', err => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
        debug(`Loader error: ${err.message}`);
        if (!streamClosed) {
          // Use end() with callback instead of close() to ensure buffered data is flushed
          // before resolving the promise, preventing data loss
          writeStream.end(() => {
            streamClosed = true;
            // Clean up the temporary file on error
            try {
              unlinkSync(tempFilePath);
            } catch (cleanupErr) {
              debug(`Error deleting temp file on error: ${cleanupErr}`);
            }
            resolvePromise(undefined);
          });
        } else {
          resolvePromise(undefined);
        }
      });

      child.on('close', () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
        debug('Introspection process closed');

        if (!streamClosed) {
          writeStream.end(() => {
            streamClosed = true;
            // Read the file once the stream is closed
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
                  const introspectionResult = introspectionSchema.parse(
                    JSON.parse(introspectionString)
                  );
                  introspectionData = introspectionResult;
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
              // Clean up the temporary directory and file
              try {
                rmSync(tempDir, { recursive: true, force: true });
              } catch (err) {
                debug(`Error deleting temp directory: ${err}`);
              }
              resolvePromise(undefined);
            }
          });
        } else {
          resolvePromise(undefined);
        }
      });
    } catch (error) {
      debug('Introspection error', error);
      resolvePromise(undefined);
    }
  });
  const framework = getFramework(args);
  if (!introspectionData) {
    return defaultResult(args);
  }

  // For now, return empty routes
  const routes = [
    {
      handle: 'filesystem',
    },
    ...introspectionData.routes,
    {
      src: '/(.*)',
      dest: '/',
    },
  ];

  return {
    routes,
    framework,
    additionalFolders: introspectionData.additionalFolders ?? [],
    additionalDeps: introspectionData.additionalDeps ?? [],
  };
};

const defaultResult = (args: {
  dir: string;
  framework: string | null | undefined;
}) => {
  return {
    routes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/',
      },
    ],
    framework: getFramework(args),
  };
};

const getFramework = (args: {
  dir: string;
  framework: string | null | undefined;
}) => {
  try {
    let version: string | undefined;
    if (args.framework) {
      // Resolve to package.json specifically
      const frameworkLibPath = require.resolve(`${args.framework}`, {
        paths: [args.dir],
      });
      const findNearestPackageJson = (dir: string): string | undefined => {
        const packageJsonPath = join(dir, 'package.json');
        if (existsSync(packageJsonPath)) {
          return packageJsonPath;
        }
        const parentDir = dirname(dir);
        if (parentDir === dir) {
          return undefined;
        }
        return findNearestPackageJson(parentDir);
      };
      const nearestPackageJsonPath = findNearestPackageJson(frameworkLibPath);
      if (nearestPackageJsonPath) {
        const frameworkPackageJson = require(nearestPackageJsonPath);
        version = frameworkPackageJson.version;
      }
    }
    return {
      slug: args.framework ?? '',
      version: version ?? '',
    };
  } catch (error) {
    // NestJS actually uses `@nestjs/core` as the package name, but the framework slug is `nestjs`
    debug(
      `Error getting framework for ${args.framework}. Setting framework version to empty string.`,
      error
    );
    return {
      slug: args.framework ?? '',
      version: '',
    };
  }
};
