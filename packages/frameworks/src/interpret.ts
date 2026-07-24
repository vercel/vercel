import { join } from 'path';
import { existsSync, promises } from 'fs';
import type { Route } from '@vercel/routing-utils';
import type { Framework } from './types';
import { readConfigFile } from './read-config-file';

const { readdir, readFile, unlink } = promises;

/**
 * Declarative, serializable strategy describing how a framework's static
 * output directory is resolved at build time. Mirrors the shape served by the
 * frameworks API (`/v1/frameworks.json`); the runtime `getOutputDirName`
 * function is rehydrated from it by {@link interpretFramework}.
 *
 * - `static`: the output dir is a fixed path.
 * - `single-subdir`: if `base` contains exactly one entry and it is a
 *   directory, use it; otherwise fall back to `base`. When `checkBrowser` is
 *   set, prefer a nested `browser/` directory when present (Angular).
 * - `single-subdir-nodot`: pick the first entry in `base` whose name contains
 *   no `.`, falling back to `base` (Polymer).
 * - `config-file`: read `key` from the first config file found in `files`,
 *   falling back to `fallback` (Hugo, Jekyll).
 */
export type OutputDirName =
  | { type: 'static'; value: string }
  | { type: 'single-subdir'; base: string; checkBrowser?: boolean }
  | { type: 'single-subdir-nodot'; base: string }
  | {
      type: 'config-file';
      files: string[];
      key: string;
      fallback: string;
    };

/**
 * Declarative replacement for the function-form `defaultRoutes` (used only by
 * Gatsby): at build time the consumer reads (and removes) a generated
 * `public/__now_routes_g4t5bY.json`, using `fallback` when the file is absent.
 */
export type GatsbyDefaultRoutes = {
  type: 'gatsby';
  fallback: Route[];
};

/**
 * A single framework descriptor as served by the frameworks API and shipped in
 * `dist/frameworks.json`.
 *
 * It mirrors {@link Framework} but replaces the non-serializable
 * `getOutputDirName` function with the declarative {@link OutputDirName}
 * strategy, and encodes function-form `defaultRoutes` as
 * {@link GatsbyDefaultRoutes}. `interpretFramework` rehydrates both into their
 * runtime function forms.
 */
export type FrameworkDescriptor = Omit<
  Framework,
  'getOutputDirName' | 'defaultRoutes'
> & {
  /** Declarative strategy for resolving the static output directory. */
  outputDirName: OutputDirName;
  /**
   * Declarative (array) default routes, or the Gatsby strategy for
   * function-computed routes.
   */
  defaultRoutes?: Route[] | GatsbyDefaultRoutes;
  /**
   * Default headers for the framework's build output. Present in the API data
   * (Dojo only); the property name's typo is inherited verbatim to stay
   * byte-compatible with upstream.
   */
  defaulHeaders?: {
    source: string;
    regex: string;
    headers: Record<string, string>;
    continue?: boolean;
  }[];
};

export type FrameworkManifest = readonly FrameworkDescriptor[];

/**
 * Returns `join(base, onlyChildDir)` when `base` contains exactly one entry
 * and that entry is a directory; otherwise returns `base`. When `checkBrowser`
 * is set, a nested `browser/` directory is preferred when present (Angular).
 */
function singleSubdir(
  base: string,
  checkBrowser: boolean
): Framework['getOutputDirName'] {
  return async (dirPrefix: string) => {
    try {
      const location = join(dirPrefix, base);
      const content = await readdir(location, { withFileTypes: true });
      if (content.length === 1 && content[0].isDirectory()) {
        const potentialOutDir = join(base, content[0].name);
        if (checkBrowser) {
          const potentialOutDirWithBrowser = join(potentialOutDir, 'browser');
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

/**
 * Returns `join(base, firstEntryWithoutADot)`, falling back to `base` when the
 * directory cannot be read (Polymer).
 */
function singleSubdirNoDot(base: string): Framework['getOutputDirName'] {
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

/**
 * Reads `key` from the first config file found in `files`, falling back to
 * `fallback` (Hugo, Jekyll).
 */
function configFileOutputDir(
  files: string[],
  key: string,
  fallback: string
): Framework['getOutputDirName'] {
  return async (dirPrefix: string) => {
    const config = await readConfigFile<Record<string, unknown>>(
      files.map(fileName => join(dirPrefix, fileName))
    );
    const value = config && config[key];
    return typeof value === 'string' ? value : fallback;
  };
}

/**
 * Rehydrates the declarative {@link OutputDirName} strategy into the runtime
 * `getOutputDirName(dirPrefix)` function.
 */
function interpretOutputDirName(
  outputDirName: OutputDirName,
  descriptor: FrameworkDescriptor
): Framework['getOutputDirName'] {
  switch (outputDirName.type) {
    case 'static': {
      const { value } = outputDirName;
      return async () => value;
    }
    case 'single-subdir':
      return singleSubdir(outputDirName.base, !!outputDirName.checkBrowser);
    case 'single-subdir-nodot':
      return singleSubdirNoDot(outputDirName.base);
    case 'config-file':
      return configFileOutputDir(
        outputDirName.files,
        outputDirName.key,
        outputDirName.fallback
      );
    default: {
      const slug = descriptor.slug ?? descriptor.name;
      throw new Error(
        `Framework "${slug}" has an unknown outputDirName strategy: ${JSON.stringify(
          outputDirName
        )}`
      );
    }
  }
}

/**
 * Rehydrates the Gatsby `defaultRoutes` strategy into its runtime function
 * form: read (and remove) the generated `public/__now_routes_g4t5bY.json`,
 * using the strategy's `fallback` routes when the file is absent.
 */
function interpretGatsbyDefaultRoutes(
  strategy: GatsbyDefaultRoutes
): (dirPrefix: string) => Promise<Route[]> {
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
      // if the file doesn't exist, use the framework's recommended fallback
      // https://www.gatsbyjs.org/docs/caching
      return strategy.fallback;
    }
  };
}

/**
 * Turns a declarative framework descriptor into a runtime {@link Framework},
 * rehydrating the `getOutputDirName` function (and, for Gatsby, a
 * function-based `defaultRoutes`) from the descriptor's declarative strategies.
 */
export function interpretFramework(descriptor: FrameworkDescriptor): Framework {
  const { outputDirName, defaultRoutes, ...rest } = descriptor;

  const framework: Framework = {
    ...(rest as Omit<Framework, 'getOutputDirName' | 'defaultRoutes'>),
    getOutputDirName: interpretOutputDirName(outputDirName, descriptor),
  };

  if (defaultRoutes) {
    framework.defaultRoutes = Array.isArray(defaultRoutes)
      ? defaultRoutes
      : interpretGatsbyDefaultRoutes(defaultRoutes);
  }

  return framework;
}

/**
 * Interprets a full framework manifest into runtime {@link Framework} objects.
 */
export function interpretManifest(manifest: FrameworkManifest): Framework[] {
  return manifest.map(interpretFramework);
}
