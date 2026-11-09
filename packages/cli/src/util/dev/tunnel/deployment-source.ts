/**
 * Files for the proxy deployment that `vc dev --tunnel` creates.
 *
 * Its function (`src/runtime-assets/dev-tunnel`) answers every request by
 * dialling the developer's dev server through api-dev-tunnel, so any instance
 * serves any request; nothing about the CLI lives on the deployment. It ships
 * as source in the CLI's runtime assets and @vercel/node builds it.
 */
import { appendRoutesToPhase, type Route } from '@vercel/routing-utils';
import runtimeAssetManifest from '../../../runtime-assets/manifest.json';
import {
  ROUTED_HEADER,
  ROUTED_PATH_PARAM,
} from '../../../runtime-assets/dev-tunnel/lib/env';
import { readRuntimeAsset } from '../../runtime-assets';

const asset = (id: keyof typeof runtimeAssetManifest) =>
  readRuntimeAsset(runtimeAssetManifest[id].source).toString('utf8');

/**
 * The function's dependencies. The Connect, protobuf and ws versions are the
 * ones it's type-checked against here, kept equal to package.json by a test:
 * the native binary's package.json has no devDependencies to read them from.
 */
export const PROXY_DEPENDENCIES = {
  '@bufbuild/protobuf': '2.12.0',
  '@connectrpc/connect': '2.0.2',
  '@connectrpc/connect-node': '2.0.2',
  // experimental_upgradeWebSocket() landed in 3.7.0.
  '@vercel/functions': '^3.9.0',
  ws: '8.18.0',
};

/**
 * @vercel/node type-checks the function as it builds it, and reports every
 * Node.js global and module as missing without these. Not the CLI's own
 * @types/node: 20.x doesn't compile under the TypeScript @vercel/node uses.
 */
export const PROXY_DEV_DEPENDENCIES = {
  '@types/node': '24.19.1',
  '@types/ws': '8.18.1',
};

/**
 * The deployment's routes: the project's own, as a deployment of the project
 * would apply them, then whatever they leave to the one function, with the
 * path as they left it.
 */
export function proxyRoutes(projectRoutes: Route[] = []): Route[] {
  return [
    // Before the project's routes, so no request arrives already marked.
    {
      src: '^/.*$',
      transforms: [
        {
          type: 'request.headers',
          op: 'delete',
          target: { key: ROUTED_HEADER },
        },
      ],
      continue: true,
    },
    ...appendRoutesToPhase({
      routes: projectRoutes,
      newRoutes: [
        // A route of its own: on the rewrite itself, a transform makes the
        // platform answer 404 whatever the function returns.
        {
          src: '^/.*$',
          transforms: [
            {
              type: 'request.headers',
              op: 'set',
              target: { key: ROUTED_HEADER },
              args: '1',
            },
          ],
          continue: true,
        },
        { src: '^/(.*)$', dest: `/api/tunnel?${ROUTED_PATH_PARAM}=/$1` },
      ],
      phase: 'filesystem',
    }),
  ];
}

/**
 * Files to write into the temp dir that gets deployed, routed by the project's
 * own routes first.
 */
export function tunnelDeploymentFiles(
  projectRoutes: Route[] = []
): Record<string, string> {
  return {
    'api/tunnel.ts': asset('devTunnelFunction'),
    'lib/env.ts': asset('devTunnelEnv'),
    'lib/tunnel_pb.ts': asset('devTunnelProto'),
    // The only static output, so the function's own files aren't served in
    // front of the app's paths.
    'public/.gitkeep': '',

    'package.json': `${JSON.stringify(
      {
        name: 'vc-dev-tunnel',
        private: true,
        dependencies: PROXY_DEPENDENCIES,
        devDependencies: PROXY_DEV_DEPENDENCIES,
      },
      null,
      2
    )}\n`,

    // The project's build settings are overridden here rather than through
    // the deployment's projectSettings, which an existing project ignores: the
    // project's own framework wins and the build fails looking for the
    // framework's dependencies. vercel.json takes precedence over both. Its
    // install command would run against these files, and its Ignored Build
    // Step could cancel the deploy (exit 1 means build). Only the project's
    // routing comes from the project.
    'vercel.json': `${JSON.stringify(
      {
        framework: null,
        installCommand: 'npm install',
        buildCommand: null,
        ignoreCommand: 'exit 1',
        outputDirectory: 'public',
        functions: { 'api/tunnel.ts': { maxDuration: 300 } },
        routes: proxyRoutes(projectRoutes),
      },
      null,
      2
    )}\n`,
  };
}
