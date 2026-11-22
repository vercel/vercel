import { describe, expect, it } from 'vitest';
import pkg from '../../../../package.json';
import {
  PROXY_DEPENDENCIES,
  PROXY_DEV_DEPENDENCIES,
  tunnelDeploymentFiles,
} from '../../../../src/util/dev/tunnel/deployment-source';

describe('tunnel deployment source', () => {
  it('pins the versions the function is type-checked against', () => {
    const { devDependencies } = pkg;
    for (const name of [
      '@bufbuild/protobuf',
      '@connectrpc/connect',
      '@connectrpc/connect-node',
      'ws',
    ] as const) {
      expect(PROXY_DEPENDENCIES[name]).toBe(devDependencies[name]);
    }
    expect(PROXY_DEV_DEPENDENCIES['@types/ws']).toBe(
      devDependencies['@types/ws']
    );
  });

  it("overrides the project's install command and Ignored Build Step", () => {
    const config = JSON.parse(tunnelDeploymentFiles()['vercel.json']);

    expect(config).toMatchObject({
      installCommand: 'npm install',
      ignoreCommand: 'exit 1',
    });
  });

  it('serves no static files of its own, and routes instead of rewriting', () => {
    const files = tunnelDeploymentFiles([{ src: '/a', dest: '/b' }]);
    const config = JSON.parse(files['vercel.json']);

    expect(files['public/.gitkeep']).toBe('');
    expect(config.outputDirectory).toBe('public');
    expect(config.rewrites).toBeUndefined();
    expect(config.routes[1]).toEqual({ src: '/a', dest: '/b' });
    expect(config.routes.at(-1).dest).toMatch(/^\/api\/tunnel\?/);
  });
});
