import { join } from 'path';
import { existsSync, promises } from 'fs';
import type { Route } from '@vercel/routing-utils';
import type { Framework } from './types';
import { readConfigFile } from './read-config-file';

const { readdir, readFile, unlink } = promises;

export interface StaticOutputDirName {
  type: 'static';
  value: string;
}

/**
 * A base directory which may contain a single subdirectory holding the
 * actual build output (e.g. Docusaurus, Angular).
 */
export interface SingleSubdirOutputDirName {
  type: 'single-subdir';
  base: string;
  /**
   * Additionally check for a `browser` directory inside the subdirectory
   * (Angular v17+ application builder layout).
   */
  checkBrowser?: boolean;
}

/**
 * Like `single-subdir`, but selects the first entry of the base directory
 * that does not contain a `.` in its name (e.g. Polymer).
 */
export interface SingleSubdirNoDotOutputDirName {
  type: 'single-subdir-nodot';
  base: string;
}

/**
 * The output directory is read from a key in the framework's configuration
 * file (e.g. Hugo's `publishDir`, Jekyll's `destination`).
 */
export interface ConfigFileOutputDirName {
  type: 'config-file';
  files: string[];
  key: string;
  fallback: string;
}

export type KnownOutputDirNameDescriptor =
  | StaticOutputDirName
  | SingleSubdirOutputDirName
  | SingleSubdirNoDotOutputDirName
  | ConfigFileOutputDirName;

/**
 * `{ type: string }` keeps this union open: newer manifests may introduce
 * descriptor types this package version does not understand.
 */
export type OutputDirNameDescriptor =
  | KnownOutputDirNameDescriptor
  | ({ type: string } & Record<string, unknown>);

export interface GatsbyDefaultRoutes {
  type: 'gatsby';
  fallback: Route[];
}

export type DefaultRoutesDescriptor =
  | Route[]
  | GatsbyDefaultRoutes
  | ({ type: string } & Record<string, unknown>);

/**
 * A frameworks manifest entry — the serializable counterpart of
 * `Framework`, with runtime behavior expressed as declarative descriptors.
 */
export type FrameworkManifestEntry = Omit<
  Framework,
  'getOutputDirName' | 'defaultRoutes'
> & {
  outputDirName: OutputDirNameDescriptor;
  defaultRoutes?: DefaultRoutesDescriptor;
  /**
   * Minimum Vercel CLI version required to build this framework.
   * When omitted, any CLI version is assumed to be compatible.
   */
  minCliVersion?: string;
  /**
   * When `true` and the CLI cannot build this entry, hard-fail instead of
   * warning and falling back to another preset (e.g. `Dockerfile.vercel`
   * container matchers, where a fallback build would be incorrect).
   */
  failOnStale?: boolean;
};

/**
 * Local overrides applied on top of interpreted manifest entries, keyed by
 * framework slug — for runtime behavior or fields the manifest does not
 * (yet) carry. Overrides win over the manifest.
 */
export type FrameworkRuntimeOverrides = Partial<Framework>;

/**
 * Thrown when a manifest entry uses a descriptor this version of the package
 * does not understand — typically because the remote manifest is newer than
 * the installed CLI.
 */
export class UnsupportedFrameworkEntryError extends Error {
  constructor(
    public readonly slug: string | null,
    public readonly field: string,
    public readonly descriptorType: string
  ) {
    super(
      `Framework "${slug}" uses an unsupported "${field}" descriptor type "${descriptorType}". An update may be required.`
    );
    this.name = 'UnsupportedFrameworkEntryError';
  }
}

function interpretOutputDirName(
  slug: string | null,
  descriptor: OutputDirNameDescriptor
): Framework['getOutputDirName'] {
  switch (descriptor.type) {
    case 'static': {
      const { value } = descriptor as StaticOutputDirName;
      return async () => value;
    }
    case 'single-subdir': {
      const { base, checkBrowser } = descriptor as SingleSubdirOutputDirName;
      return async (dirPrefix: string) => {
        try {
          const location = join(dirPrefix, base);
          const content = await readdir(location, { withFileTypes: true });

          if (content.length === 1 && content[0].isDirectory()) {
            const potentialOutDir = join(base, content[0].name);
            if (checkBrowser) {
              const potentialOutDirWithBrowser = join(
                potentialOutDir,
                'browser'
              );
              return existsSync(potentialOutDirWithBrowser)
                ? potentialOutDirWithBrowser
                : potentialOutDir;
            }
            return potentialOutDir;
          }
        } catch (error) {
          console.error(`Error detecting output directory: `, error);
        }
        return base;
      };
    }
    case 'single-subdir-nodot': {
      const { base } = descriptor as SingleSubdirNoDotOutputDirName;
      return async (dirPrefix: string) => {
        try {
          const location = join(dirPrefix, base);
          const content = await readdir(location);
          const paths = content.filter(item => !item.includes('.'));
          return join(base, paths[0]);
        } catch (error) {
          console.error(`Error detecting output directory: `, error);
        }
        return base;
      };
    }
    case 'config-file': {
      const { files, key, fallback } = descriptor as ConfigFileOutputDirName;
      return async (dirPrefix: string) => {
        const config = await readConfigFile<Record<string, unknown>>(
          files.map(fileName => join(dirPrefix, fileName))
        );
        const value = config?.[key];
        return (typeof value === 'string' && value) || fallback;
      };
    }
    default:
      throw new UnsupportedFrameworkEntryError(
        slug,
        'outputDirName',
        descriptor.type
      );
  }
}

function interpretDefaultRoutes(
  slug: string | null,
  descriptor: DefaultRoutesDescriptor
): Framework['defaultRoutes'] {
  if (Array.isArray(descriptor)) {
    return descriptor;
  }
  if (descriptor.type === 'gatsby') {
    const { fallback } = descriptor as GatsbyDefaultRoutes;
    return async (dirPrefix: string) => {
      // This file could be generated by gatsby-plugin-now or gatsby-plugin-zeit-now
      try {
        const nowRoutesPath = join(
          dirPrefix,
          'public',
          '__now_routes_g4t5bY.json'
        );
        const content = await readFile(nowRoutesPath, 'utf8');
        const nowRoutes = JSON.parse(content);
        try {
          await unlink(nowRoutesPath);
        } catch (_err) {
          // do nothing if deleting the file fails
        }
        return nowRoutes;
      } catch (_err) {
        return fallback;
      }
    };
  }
  throw new UnsupportedFrameworkEntryError(
    slug,
    'defaultRoutes',
    descriptor.type
  );
}

function stripManifestOnlyFields(
  entry: FrameworkManifestEntry
): Omit<Framework, 'getOutputDirName' | 'defaultRoutes'> {
  const clone: Record<string, unknown> = { ...entry };
  delete clone.outputDirName;
  delete clone.defaultRoutes;
  delete clone.minCliVersion;
  delete clone.failOnStale;
  return clone as Omit<Framework, 'getOutputDirName' | 'defaultRoutes'>;
}

/**
 * Interprets a single manifest entry into a usable `Framework`.
 *
 * @throws {UnsupportedFrameworkEntryError} when the entry uses a descriptor
 * this version of the package does not understand.
 */
export function interpretFramework(
  entry: FrameworkManifestEntry,
  overrides?: FrameworkRuntimeOverrides
): Framework {
  const framework = {
    ...(stripManifestOnlyFields(entry) as Framework),
    ...overrides,
  };

  framework.getOutputDirName =
    overrides?.getOutputDirName ??
    interpretOutputDirName(entry.slug, entry.outputDirName);

  const defaultRoutes =
    overrides?.defaultRoutes ??
    (entry.defaultRoutes
      ? interpretDefaultRoutes(entry.slug, entry.defaultRoutes)
      : undefined);
  if (defaultRoutes) {
    framework.defaultRoutes = defaultRoutes;
  }

  return framework;
}

/**
 * Interprets a frameworks manifest into a list of usable `Framework`s.
 *
 * @throws {UnsupportedFrameworkEntryError} when any entry cannot be
 * interpreted. Use `resolveFrameworkList()` for remote manifests — it
 * degrades gracefully instead of throwing.
 */
export function createFrameworks(
  overrides: Record<string, FrameworkRuntimeOverrides>,
  manifest: readonly FrameworkManifestEntry[]
): Framework[] {
  return manifest.map(entry =>
    interpretFramework(
      entry,
      entry.slug === null ? undefined : overrides[entry.slug]
    )
  );
}
