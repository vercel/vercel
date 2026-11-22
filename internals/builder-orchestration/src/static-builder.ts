import minimatch from 'minimatch';
import { resolve } from 'path';
import {
  FileBlob,
  createDaemonStaticFileFilter,
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  getReportedServiceType,
  shouldServe as defaultShouldServe,
} from '@vercel/build-utils';
import type {
  BuildV2,
  Diagnostics,
  Files,
  ShouldServe,
} from '@vercel/build-utils';

export const version = 2;

const ALWAYS_EXCLUDED_PREFIXES = ['.git/', 'node_modules/'];
const DEFAULT_EXCLUDED_FILES = [
  '.gitignore',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'README.md',
];

export function createStaticBuilder(vercelConfigExtensions: readonly string[]) {
  const alwaysExcludedFiles = [
    'vercel.json',
    'vercel.toml',
    ...vercelConfigExtensions.map(ext => `vercel.${ext}`),
    '.vercelignore',
    'now.json',
    '.nowignore',
  ];

  const build: BuildV2 = async ({
    entrypoint,
    files,
    config,
    workPath,
    meta = {},
    service,
  }) => {
    const output: Files = {};
    const outputDirectory = config.zeroConfig ? config.outputDirectory : '';
    const canPublish = meta.daemonContext
      ? await createDaemonStaticFileFilter({
          context: meta.daemonContext,
          publishPath: resolve(workPath, outputDirectory || '.'),
          serviceName: service?.name,
        })
      : undefined;

    for (const [srcFilename, fileFsRef] of Object.entries(files)) {
      if (
        entrypoint &&
        !(
          entrypoint === srcFilename ||
          minimatch(srcFilename, entrypoint, { dot: true })
        )
      ) {
        continue;
      }

      // Static output files are moved to the root directory, so remove the
      // output directory prefix first. The exclusion checks below must run
      // against the published path (e.g. `.env.local`), not the
      // project-relative path (e.g. `dist/.env.local`), or nested sensitive
      // files would bypass them and become public deployment assets.
      let filename = srcFilename;
      if (outputDirectory) {
        const outputMatch = outputDirectory + '/';
        if (filename.startsWith(outputMatch)) {
          filename = filename.slice(outputMatch.length);
        }
      }

      if (
        ALWAYS_EXCLUDED_PREFIXES.some(prefix => filename.startsWith(prefix)) ||
        alwaysExcludedFiles.includes(filename) ||
        DEFAULT_EXCLUDED_FILES.includes(filename) ||
        filename.startsWith('.env')
      ) {
        continue;
      }

      if (!canPublish || (await canPublish(resolve(workPath, srcFilename)))) {
        output[filename] = fileFsRef;
      }
    }

    return { output };
  };

  const shouldServe: ShouldServe = _opts => {
    const opts = { ..._opts };
    const {
      config: { zeroConfig, outputDirectory },
    } = opts;

    // Add the output directory prefix
    if (zeroConfig && outputDirectory) {
      opts.entrypoint = `${outputDirectory}/${opts.entrypoint}`;
      opts.requestPath = `${outputDirectory}/${opts.requestPath}`;
    }

    return defaultShouldServe(opts);
  };

  const diagnostics: Diagnostics = async ({ service }) => ({
    [MANIFEST_FILENAME]: new FileBlob({
      data: JSON.stringify({
        version: MANIFEST_VERSION,
        runtime: 'static',
        // Static builder is only used for app builds.
        // Set it explicitly here so that the build type detection doesn't need
        // to be aware of the static builder.
        buildType: 'app',
        dependencies: [],
        serviceType:
          service !== undefined ? getReportedServiceType(service) : undefined,
      }),
    }),
  });

  return { version, build, shouldServe, diagnostics } as const;
}
