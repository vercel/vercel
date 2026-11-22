// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import output from '../../../../../../output-manager';
import { createHash } from 'crypto';
import semver from 'semver';
import {
  FileBlob,
  type Lambda,
  type NodejsLambda,
  streamToBuffer,
} from '@vercel/build-utils';
import { collectUncompressedSize } from './collect-uncompressed-size';

const MIB = 1024 * 1024;
const MAX_UNCOMPRESSED_FUNCTION_SIZE_BYTES = 250 * MIB;

/** Headroom for files added after grouping (launcher, layers). Must match build-container's `LAMBDA_RESERVED_UNCOMPRESSED_SIZE`. */
const LAMBDA_RESERVED_UNCOMPRESSED_SIZE_BYTES = 25 * MIB;

/**
 * Standalone size at/above which a function can't be guaranteed to fit a normal
 * Lambda, so build-container serves it on Hive (`tooLargeForLambda`). Such a
 * route is isolated and never bundled, so grouping can't compound it or pull
 * small routes onto Hive. Must match build-container's threshold.
 */
const LARGE_FUNCTION_THRESHOLD_BYTES =
  MAX_UNCOMPRESSED_FUNCTION_SIZE_BYTES -
  LAMBDA_RESERVED_UNCOMPRESSED_SIZE_BYTES;

/**
 * Manifest file names used during Next.js lambda bundling to filter
 * dynamic/static routes per serverless function.
 *
 * Keep these in sync with the Build Container's group-lambdas implementation.
 * Ported with the BYOC helpers; see packages/cli/docs/describe.md.
 */
export const MANIFEST_FILE_NAMES = [
  'routes-manifest.json',
  'server/pages-manifest.json',
  'server/app-paths-manifest.json',
  'app-path-routes-manifest.json',
] as const;

export type ManifestFileKeys = {
  [K in (typeof MANIFEST_FILE_NAMES)[number]]?: string;
};

// biome-ignore lint/complexity/noUselessEscapeInRegex: ignored using `--suppress`
const TEST_DYNAMIC_ROUTE = /\/\[[^\/]+?\](?=\/|$)/;

function isNextjsDynamicRoute(route: string): boolean {
  // oxlint-disable-next-line no-param-reassign -- Automatically added during Biome migration
  route = route.startsWith('/') ? route : `/${route}`;
  return TEST_DYNAMIC_ROUTE.test(route);
}

/**
 * Fields from NodejsLambda that must match for lambdas to be bundled together.
 * This type excludes fields that are:
 * - Internal/computed: 'type', 'launcherType', 'zipBuffer'
 * - File-related (handled separately): 'files', 'experimentalAllowBundling'
 *
 * If a new field is added to NodejsLambda, TypeScript will error here,
 * forcing us to explicitly decide whether it should be compared or excluded.
 */
type LambdaBundleComparisonFields = Exclude<
  keyof NodejsLambda,
  // Internal/computed fields that don't affect bundling compatibility
  | 'type'
  | 'launcherType'
  | 'zipBuffer'
  | 'createZip'
  // File-related fields handled separately
  | 'files'
  | 'experimentalAllowBundling'
>;

/**
 * Ensures that the tuple T contains exactly all fields from union U (no more, no less).
 * If fields are missing, TypeScript will error because U won't be assignable to T[number].
 * If extra fields exist, TypeScript will error because T[number] won't be assignable to U.
 */
type AssertExactFields<T extends readonly string[], U extends string> = [
  U,
] extends [T[number]]
  ? [T[number]] extends [U]
    ? T
    : never
  : never;

/**
 * Computes a signature string for a lambda based on fields that must match
 * for lambdas to be bundled together. This allows O(1) lookup of compatible groups.
 */
function computeLambdaFieldsSignature(
  lambda: Lambda | NodejsLambda,
  lambdaFields: readonly (keyof NodejsLambda)[]
): string {
  const parts: string[] = [];
  for (const field of lambdaFields) {
    parts.push(JSON.stringify((lambda as NodejsLambda)[field]));
  }
  return parts.join('|');
}

interface BundledLambdaMeta {
  lambda: Lambda;
  lambdaNames: string[];
  signature: string;
  handlerDigest: string | undefined;
  uncompressedBytes: number;
  fileSizesByKey: Map<string, number>;
  /** Isolated large function (a single route ≥ {@link LARGE_FUNCTION_THRESHOLD_BYTES}); never merged into or out of. */
  isLarge: boolean;
}

/**
 * Collect per-file sizes for a single lambda. This is intentionally sequential
 * so we don't materialize metadata for all lambdas/files at once, which can
 * spike memory on large deployments.
 */
async function getLambdaFileSizeMetadata(
  lambdaFiles: NonNullable<Lambda['files']>
): Promise<{
  fileKeys: string[];
  fileSizes: Map<string, number>;
  uncompressedSize: number;
}> {
  const fileKeys = Object.keys(lambdaFiles);
  const fileSizes = new Map<string, number>();

  let uncompressedSize = 0;
  for (const fileKey of fileKeys) {
    const file = lambdaFiles[fileKey];
    if (file === undefined) {
      throw new Error('Expected lambdaFiles[fileKey] to be defined');
    }
    let fileSize = 0;

    if (file.type === 'FileBlob') {
      fileSize = file.data.length;
    } else if (file.type === 'FileFsRef') {
      // Reuse collectUncompressedSize to preserve existing FileFsRef sizing behavior.
      fileSize = await collectUncompressedSize({ [fileKey]: file }, undefined);
    }

    fileSizes.set(fileKey, fileSize);
    uncompressedSize += fileSize;
  }

  return { fileKeys, fileSizes, uncompressedSize };
}

/*
  When "experimentalAllowBundling" is enabled for lambdas
  we analyze the common files between lambdas and bundle
  them to reduce how many are created
*/
export async function groupLambdas(
  lambdas: Record<string, Lambda>,
  options: {
    force: 'all' | undefined;
    maxBundleSizeMb: number | undefined;
    debug: boolean | undefined;
  }
) {
  const { force } = options;
  // These are the fields that must match for the lambdas to be bundled.
  // The MissingFields type check ensures we don't miss any fields from NodejsLambda.
  // If a field is missing, TypeScript will error with the missing field name(s).
  const lambdaFields = [
    'allowQuery',
    'affinity',
    'architecture',
    'awsLambdaHandler',
    'environment',
    'experimentalResponseStreaming',
    'experimentalTriggers',
    'framework',
    // TODO: handler should be allowed to be custom
    // per-output and we create a handler map that
    // is exposed to the bridge that allows loading
    // the specific handler per-request via a proxy header.
    // This should allow supporting arbitrary frameworks besides Next.js
    'handler',
    'maxConcurrency',
    'maxDuration',
    'memory',
    'operationType',
    'regions',
    'runtime',
    'runtimeLanguage',
    'shouldAddHelpers',
    'shouldAddSourcemapSupport',
    'shouldDisableAutomaticFetchInstrumentation',
    'supportsCancellation',
    'supportsMultiPayloads',
    'supportsResponseStreaming',
    'supportsWrapper',
    'useWebApi',
    'functionFailoverRegions',
  ] as const;

  // This type assertion ensures lambdaFields contains exactly all LambdaBundleComparisonFields.
  // If a field is missing or extra, TypeScript will produce a compile error.
  const _typeCheck: AssertExactFields<
    typeof lambdaFields,
    LambdaBundleComparisonFields
  > = lambdaFields;

  const fieldsToCompare =
    force === 'all' ? (['runtime', 'maxConcurrency'] as const) : lambdaFields;

  // Max uncompressed function size before we stop attempting to bundle together.
  // Default is intentionally below hard limits to leave room for small accounting differences.
  let maxUncompressedFunctionSize = LARGE_FUNCTION_THRESHOLD_BYTES;

  const maxBundleSizeMb = options.maxBundleSizeMb;
  if (maxBundleSizeMb !== undefined && Number.isFinite(maxBundleSizeMb)) {
    const customMaxUncompressedFunctionSize = Math.floor(maxBundleSizeMb * MIB);
    output.warn(
      `Warn: custom max uncompressed function size of ${
        customMaxUncompressedFunctionSize / MIB
      }MiB configured`
    );
    maxUncompressedFunctionSize = Math.min(
      customMaxUncompressedFunctionSize,
      MAX_UNCOMPRESSED_FUNCTION_SIZE_BYTES
    );
  }

  // ==========================================================================
  // PHASE 0: Pre-group lambdas that share the same Lambda instance
  // This avoids processing duplicate instances in the expensive grouping phase
  // ==========================================================================
  const seenLambdas = new Map<Lambda, string[]>();

  for (const [name, lambda] of Object.entries(lambdas)) {
    if (!lambda.experimentalAllowBundling || !lambda.files) {
      continue;
    }

    const existingNames = seenLambdas.get(lambda);
    if (existingNames) {
      // This lambda instance is already shared with other entries
      existingNames.push(name);
    } else {
      // First time seeing this lambda instance
      seenLambdas.set(lambda, [name]);
    }
  }

  // Cache handler content promises by file reference to deduplicate repeated reads.
  const handlerDigestPromiseCache = new Map<
    NonNullable<Lambda['files']>[string],
    Promise<string | undefined>
  >();

  const getHandlerDigest = (
    handlerFile: NonNullable<Lambda['files']>[string] | undefined
  ): Promise<string | undefined> => {
    if (!handlerFile) return Promise.resolve(undefined);

    const cached = handlerDigestPromiseCache.get(handlerFile);
    if (cached) return cached;

    const promise = (async () => {
      try {
        const handlerStream = handlerFile.toStream();
        const handlerBuffer = await streamToBuffer(handlerStream);
        const handlerBytes = new Uint8Array(
          handlerBuffer.buffer,
          handlerBuffer.byteOffset,
          handlerBuffer.byteLength
        );
        return createHash('sha1').update(handlerBytes).digest('hex');
      } catch {
        // Handler file may not exist on disk (e.g., in tests)
        return undefined;
      }
    })();

    handlerDigestPromiseCache.set(handlerFile, promise);
    return promise;
  };

  // ==========================================================================
  // PHASE 1: Group lambdas incrementally to keep memory bounded.
  // ==========================================================================
  const bundlesBySignature = new Map<string, BundledLambdaMeta[]>();
  const allBundledLambdas: BundledLambdaMeta[] = [];

  for (const [lambda, lambdaNames] of seenLambdas) {
    const lambdaFiles = lambda.files;
    if (!lambdaFiles) continue;
    const signature = computeLambdaFieldsSignature(lambda, fieldsToCompare);
    const { fileKeys, fileSizes, uncompressedSize } =
      await getLambdaFileSizeMetadata(lambdaFiles);
    const handlerDigest = await getHandlerDigest(lambdaFiles[lambda.handler]);
    const compatibleBundles = bundlesBySignature.get(signature);

    // Classify by standalone size so large routes stay isolated regardless of
    // `maxBundleSizeMb`, which can raise the merge cap above this threshold.
    const isLarge = uncompressedSize >= LARGE_FUNCTION_THRESHOLD_BYTES;

    let foundMatchingBundle = false;

    if (compatibleBundles && !isLarge) {
      for (const bundleMeta of compatibleBundles) {
        // Never merge a normal route into an isolated large function.
        if (bundleMeta.isLarge) {
          continue;
        }

        const handlersMatch = handlerDigest === bundleMeta.handlerDigest;

        if (!handlersMatch && force !== 'all') {
          continue;
        }

        // Size accounting must include replacing an existing file key with a
        // different-sized file, because Object.assign() overwrites by key.
        let uncompressedBytesIncrease = 0;
        for (const fileKey of fileKeys) {
          const incomingFileSize = fileSizes.get(fileKey) ?? 0;
          const existingFileSize = bundleMeta.fileSizesByKey.get(fileKey);

          if (existingFileSize === undefined) {
            uncompressedBytesIncrease += incomingFileSize;
          } else {
            uncompressedBytesIncrease += incomingFileSize - existingFileSize;
          }
        }

        // Check if adding this lambda would exceed the max uncompressed size
        const newTotalSize =
          bundleMeta.uncompressedBytes + uncompressedBytesIncrease;

        if (newTotalSize <= maxUncompressedFunctionSize) {
          foundMatchingBundle = true;
          bundleMeta.uncompressedBytes = newTotalSize;
          bundleMeta.lambdaNames.push(...lambdaNames);

          for (const fileKey of fileKeys) {
            bundleMeta.fileSizesByKey.set(fileKey, fileSizes.get(fileKey) ?? 0);
          }

          const potentialLambdaFiles = bundleMeta.lambda.files;
          if (potentialLambdaFiles) {
            bundleMeta.lambda.files = Object.assign(
              potentialLambdaFiles,
              lambdaFiles
            );
          }
          break;
        }
      }
    }

    if (!foundMatchingBundle) {
      const newBundleMeta: BundledLambdaMeta = {
        lambda,
        signature,
        handlerDigest,
        isLarge,
        uncompressedBytes: uncompressedSize,
        fileSizesByKey: new Map(fileSizes),
        lambdaNames: [...lambdaNames],
      };

      let signatureBundles = bundlesBySignature.get(signature);
      if (!signatureBundles) {
        signatureBundles = [];
        bundlesBySignature.set(signature, signatureBundles);
      }
      signatureBundles.push(newBundleMeta);
      allBundledLambdas.push(newBundleMeta);
    }
  }

  const finalLambdas: Record<string, Lambda> = Object.assign({}, lambdas);

  // allow outputting debug logs for the function grouping
  if (options.debug) {
    output.debug(
      `GROUP_LAMBDAS: ` +
        JSON.stringify(
          allBundledLambdas.map(bundleMeta => ({
            lambdaNames: bundleMeta.lambdaNames,
            signature: bundleMeta.signature,
            uncompressedBytes: bundleMeta.uncompressedBytes,
          })),
          null,
          2
        )
    );
    output.debug(`total grouped lambdas: ${allBundledLambdas.length}`);
  }

  for (const bundleMeta of allBundledLambdas) {
    const lambda = bundleMeta.lambda;
    for (const lambdaName of bundleMeta.lambdaNames) {
      finalLambdas[lambdaName] = lambda;
    }

    // If this is a Next.js app we need to filter manifests to only
    // the bundled routes otherwise we could fail to render the correct
    // outputs and 404 unexpectedly
    if (lambda.framework?.slug === 'nextjs' && lambda.framework.version) {
      const CORRECTED_MANIFESTS_VERSION = 'v12.2.0';
      const isCorrectManifests = semver.gte(
        lambda.framework.version,
        CORRECTED_MANIFESTS_VERSION
      );

      if (isCorrectManifests) {
        const pageFiles: string[] = [];
        const manifestFileKeys: ManifestFileKeys = {};
        const manifestFileNames = MANIFEST_FILE_NAMES;

        for (const fileKey of Object.keys(lambda.files || {})) {
          const isPageFile = fileKey.includes('server/pages/');
          const isAppFile = fileKey.includes('server/app/');

          if (isPageFile || isAppFile) {
            const relativePageFile = fileKey
              .split(`server/${isPageFile ? 'pages' : 'app'}/`)
              .pop();

            if (relativePageFile) {
              pageFiles.push(relativePageFile);
            }
          }

          for (const manifestFileName of manifestFileNames) {
            if (fileKey.endsWith(`/${manifestFileName}`)) {
              manifestFileKeys[manifestFileName] = fileKey;
            }
          }
        }

        // filter dynamic routes to only the included dynamic routes
        // in this specific serverless function so that we don't
        // accidentally match a dynamic route while resolving that
        // is not actually in this specific serverless function
        const appPathRoutesManifestFilesKey =
          manifestFileKeys['app-path-routes-manifest.json'];
        const appPathRoutesManifestFile =
          appPathRoutesManifestFilesKey &&
          lambda.files?.[appPathRoutesManifestFilesKey];

        const appPathRoutesManifest = appPathRoutesManifestFile
          ? await streamToBuffer(appPathRoutesManifestFile.toStream())
              .then(res => JSON.parse(res.toString('utf8')))
              .catch(() => ({}))
          : {};

        for (const manifestFileName of manifestFileNames) {
          const manifestFilesKey = manifestFileKeys[manifestFileName];
          const manifestFile =
            manifestFilesKey && lambda.files?.[manifestFilesKey];

          if (!manifestFile) {
            continue;
          }

          const manifestData = JSON.parse(
            (await streamToBuffer(manifestFile.toStream())).toString('utf8')
          );

          const normalizedPages = new Set(
            pageFiles.map(page => {
              // oxlint-disable-next-line no-param-reassign -- Automatically added during Biome migration
              page = `/${page.replace(/\.js$/, '')}`;
              // oxlint-disable-next-line no-param-reassign -- Automatically added during Biome migration
              if (page === '/index') page = '/';
              return appPathRoutesManifest[page] || page;
            })
          );

          switch (manifestFileName) {
            case 'routes-manifest.json': {
              const filterItem = (item: { page: string }) =>
                normalizedPages.has(item.page);

              manifestData.dynamicRoutes =
                manifestData.dynamicRoutes?.filter(filterItem);
              manifestData.staticRoutes =
                manifestData.staticRoutes?.filter(filterItem);
              break;
            }
            case 'server/pages-manifest.json': {
              for (const key of Object.keys(manifestData)) {
                if (isNextjsDynamicRoute(key) && !normalizedPages.has(key)) {
                  delete manifestData[key];
                }
              }
              break;
            }
            case 'server/app-paths-manifest.json': {
              if (appPathRoutesManifest) {
                for (const key of Object.keys(manifestData)) {
                  const normalizedKey =
                    appPathRoutesManifest[key] ||
                    key.replace(/(^|\/)(page|route)$/, '');

                  if (
                    isNextjsDynamicRoute(normalizedKey) &&
                    !normalizedPages.has(normalizedKey)
                  ) {
                    delete manifestData[key];
                  }
                }
              }
              break;
            }
          }

          if (lambda.files) {
            lambda.files[manifestFilesKey] = new FileBlob({
              contentType: 'application/json',
              data: JSON.stringify(manifestData),
            });
          }
        }
      }
    }
  }
  return finalLambdas;
}
