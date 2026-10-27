import { describe, expect, it } from 'vitest';
import {
  ROUTED_HEADER,
  ROUTED_PATH_PARAM,
} from '../../../../src/runtime-assets/dev-tunnel/lib/env';
import { proxyRoutes } from '../../../../src/util/dev/tunnel/deployment-source';
import { projectRoutes } from '../../../../src/util/dev/tunnel/routing';

const unmark = {
  src: '^/.*$',
  transforms: [
    { type: 'request.headers', op: 'delete', target: { key: ROUTED_HEADER } },
  ],
  continue: true,
};
const mark = {
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
};
const catchAll = {
  src: '^/(.*)$',
  dest: `/api/tunnel?${ROUTED_PATH_PARAM}=/$1`,
};

describe('tunnel routing', () => {
  it("takes only the project's routing from its config", () => {
    expect(
      projectRoutes({
        buildCommand: 'turbo build',
        installCommand: 'pnpm install',
        functions: { 'app/**/*': { maxDuration: 60 } },
        crons: [{ path: '/api/cron', schedule: '0 0 * * *' }],
        redirects: [{ source: '/old', destination: '/new', permanent: false }],
      })
    ).toEqual([{ src: '^/old$', headers: { Location: '/new' }, status: 307 }]);
  });

  it("keeps a project's own routes, normalized as a deployment's are", () => {
    expect(projectRoutes({ routes: [{ src: '/a', dest: '/b' }] })).toEqual([
      { src: '^/a$', dest: '/b' },
    ]);
  });

  it("applies the project's routes before the rest goes to the function", () => {
    const routes = proxyRoutes(
      projectRoutes({
        redirects: [{ source: '/r', destination: '/t', permanent: false }],
        rewrites: [{ source: '/old/:path*', destination: '/new/:path*' }],
        headers: [{ source: '/(.*)', headers: [{ key: 'x-a', value: '1' }] }],
      })
    );

    expect(routes).toEqual([
      unmark,
      { src: '^/r$', headers: { Location: '/t' }, status: 307 },
      { src: '^(?:/(.*))$', headers: { 'x-a': '1' }, continue: true },
      { handle: 'filesystem' },
      expect.objectContaining({ dest: '/new/$1', check: true }),
      mark,
      catchAll,
    ]);
  });

  it('sends everything to the function for a project without routing', () => {
    expect(proxyRoutes(projectRoutes({}))).toEqual([
      unmark,
      { handle: 'filesystem' },
      mark,
      catchAll,
    ]);
  });
});
