import { join, basename, extname } from 'node:path';
import { Project } from 'ts-morph';
import {
  mkdirSync,
  writeFileSync,
  cpSync,
  rmSync,
  readdirSync,
  readFileSync,
} from 'fs';
import { getConfig, type BaseFunctionConfig } from '@vercel/static-config';
import type { Preset, Config, BuildManifest } from '@react-router/dev/config';

type RouteManifestEntry = BuildManifest['routes'][string];

function hashConfig(config: Record<string, unknown>): string {
  const str = JSON.stringify(config);
  return Buffer.from(str).toString('base64url');
}

function flattenAndSort(object: Record<string, unknown>) {
  const sortedObject: Record<string, unknown> = {};
  const keys: string[] = [];
  for (const key in object) keys.push(key);
  for (const key of keys.sort()) sortedObject[key] = object[key];
  return sortedObject;
}

function runOnce<Runner extends (...args: any[]) => any>(runner: Runner) {
  let ran = false;
  return (...args: Parameters<Runner>) => {
    if (ran) return;
    ran = true;
    runner(...args);
  };
}

export function vercelPreset(): Preset {
  const project = new Project();
  let vercelEntryServerPath: string | undefined;
  let originalEntryServerPath: string | undefined;
  let originalEntryServerContents: string | undefined;
  const routeConfigs = new Map<string, BaseFunctionConfig>();
  const bundleConfigs = new Map<string, BaseFunctionConfig>();

  /**
   * Returns the exported `config` from the leaf route file,
   * including the configuration from any parent routes,
   * which is done via JavaScript prototype inheritance.
   *
   * Note that the `branch` array is sorted according to the
   * hierarchy of the route files, so the first element of
   * the array is the parent layout route, and the last
   * element is the leaf route. Thusly, we iterate over
   * the array in reverse order.
   */
  function getRouteConfig(
    branch: RouteManifestEntry[],
    index = branch.length - 1
  ) {
    const route = branch[index];
    let config = routeConfigs.get(route.id);
    if (!config) {
      // @ts-expect-error TODO: figure out why TypeScript is complaining here…
      config = getConfig(project, route.file) || {};
      if (index > 0) {
        Object.setPrototypeOf(config, getRouteConfig(branch, index - 1));
      }
      routeConfigs.set(route.id, config);
    }
    return config;
  }

  // If there are any "edge" runtime routes, then the
  // `entry.server` file needs use the `@vercel/react-router` package.
  //
  //  - If there is no `entry.server` file, then we copy in the Vercel entry server
  //  - If there is a `entry.server` file, then we run a RegExp on the contents to
  //    see if `@vercel/react-router` is being used
  //      - If no RegExp match, we print a warning and link to docs,
  //        but continue the build
  const injectVercelEntryServer = runOnce((reactRouterUserConfig: Config) => {
    const appDirectory = reactRouterUserConfig.appDirectory ?? 'app';
    const entryServerFile = readdirSync(appDirectory).find(
      f => basename(f, extname(f)) === 'entry.server'
    );
    if (entryServerFile) {
      originalEntryServerPath = join(appDirectory, entryServerFile);
      originalEntryServerContents = readFileSync(
        originalEntryServerPath,
        'utf8'
      );
      const usesVercelReactRouterPackage = /["']@vercel\/react-router['"]/.test(
        originalEntryServerContents
      );
      if (usesVercelReactRouterPackage) {
        console.log(
          `[vc] Detected "${entryServerFile}" using \`@vercel/react-router\``
        );
      } else {
        console.warn(
          `WARN: The \`@vercel/react-router\` package was not detected in your "${entryServerFile}" file.`
        );
        console.warn(
          `WARN: Using the Edge Runtime may not work with your current configuration.`
        );
        console.warn(
          `WARN: Please see the docs to learn how to use a custom "${entryServerFile}":`
        );
        console.warn(
          `WARN: https://vercel.com/docs/frameworks/react-router#using-a-custom-app/entry.server-file`
        );
      }
    } else {
      console.log(
        `[vc] No "entry.server" found. Copying in default "entry.server.jsx".`
      );
      vercelEntryServerPath = join(appDirectory, 'entry.server.jsx');
      cpSync(
        new URL('defaults/entry.server.jsx', import.meta.url),
        vercelEntryServerPath
      );
    }
  });

  const createServerBundles =
    (reactRouterUserConfig: Config): Config['serverBundles'] =>
    ({ branch }) => {
      let config = getRouteConfig(branch);
      if (!config.runtime) {
        config.runtime = 'nodejs';
      }

      if (config.runtime === 'edge') {
        injectVercelEntryServer(reactRouterUserConfig);
      }

      config = flattenAndSort(config);
      const id = `${config.runtime}_${hashConfig(config)}`;
      if (!bundleConfigs.has(id)) {
        bundleConfigs.set(id, config);
      }
      return id;
    };

  const buildEnd: Config['buildEnd'] = ({
    buildManifest,
    reactRouterConfig,
    viteConfig,
  }) => {
    // Clean up any modifications to the `entry.server` files
    if (vercelEntryServerPath) {
      rmSync(vercelEntryServerPath);
      if (originalEntryServerPath && originalEntryServerContents) {
        writeFileSync(originalEntryServerPath, originalEntryServerContents);
      }
    }

    if (buildManifest?.serverBundles && bundleConfigs.size) {
      for (const bundle of Object.values(buildManifest.serverBundles)) {
        const bundleWithConfig = {
          ...bundle,
          config: bundleConfigs.get(bundle.id),
        };
        buildManifest.serverBundles[bundle.id] = bundleWithConfig;
      }
    }

    if (buildManifest?.routes && routeConfigs.size) {
      for (const route of Object.values(buildManifest.routes)) {
        const routeWithConfig = {
          ...route,
          config: routeConfigs.get(route.id),
        };
        buildManifest.routes[route.id] = routeWithConfig;
      }
    }

    const assetsDir = viteConfig?.build?.assetsDir;

    const json = JSON.stringify(
      {
        buildManifest,
        reactRouterConfig,
        viteConfig: assetsDir
          ? {
              build: {
                assetsDir,
              },
            }
          : undefined,
      },
      null,
      2
    );

    mkdirSync('.vercel', { recursive: true });
    writeFileSync('.vercel/react-router-build-result.json', `${json}\n`);
  };

  return {
    name: 'vercel',
    reactRouterConfig({ reactRouterUserConfig }) {
      return {
        /**
         * Invoked once per leaf route. Reads the `export const config`
         * of the route file (and all parent routes) and hashes the
         * combined config to determine the server bundle ID.
         */
        serverBundles:
          reactRouterUserConfig.ssr !== false
            ? createServerBundles(reactRouterUserConfig)
            : undefined,

        /**
         * Invoked at the end of the `react-router build` command.
         *   - Clean up the `entry.server` file if one was copied.
         *   - Serialize the `buildManifest` and `reactRouterConfig` objects
         *     to the `.vercel/react-router-build-result.json` file, including
         *     the static configs parsed from each route and server bundle.
         */
        buildEnd,
      };
    },
  };
}
