import {
  getStandaloneServerRoutes,
  getVercelRuntimeRoutes,
  STANDALONE_LAMBDA_PATH,
} from '../../src/standalone-server';

const catchAll = {
  src: '/(.*)',
  dest: `/${STANDALONE_LAMBDA_PATH}`,
  transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
};

describe('standalone server routes', () => {
  it.each([
    { label: 'a non-service build', service: undefined },
    { label: 'a named V2 service', service: { name: 'my-backend' } },
  ])('routes $label to the standalone Lambda', ({ service }) => {
    expect(getStandaloneServerRoutes(service)).toEqual([
      { handle: 'filesystem' },
      catchAll,
    ]);
  });

  it('does not park the Lambda at `index`', () => {
    expect(STANDALONE_LAMBDA_PATH).not.toBe('index');
  });

  it('copies the resolved rewrite destination into the request path', () => {
    const [, route] = getStandaloneServerRoutes(undefined)!;
    expect(route).toMatchObject({
      transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
    });
  });

  it.each([
    {
      label: 'a V1 web service',
      service: { name: 'legacy-web', type: 'web' as const },
    },
    {
      label: 'a V1 worker service',
      service: { name: 'legacy-worker', type: 'worker' as const },
    },
  ])('does not emit routes for $label', ({ service }) => {
    expect(getStandaloneServerRoutes(service)).toBeUndefined();
  });
});

describe('vercel_runtime routes', () => {
  it('preserves the whole-app fallback for a non-service build', () => {
    expect(getVercelRuntimeRoutes('src/main.rs', undefined)).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/src/main' },
    ]);
  });

  it('uses the detected entrypoint as the destination', () => {
    expect(
      getVercelRuntimeRoutes('crates/api/src/server.rs', undefined)
    ).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/crates/api/src/server' },
    ]);
  });

  it('does not emit a whole-app fallback for API handlers', () => {
    expect(getVercelRuntimeRoutes('api/handler.rs', undefined)).toBeUndefined();
  });

  it('leaves V1 service routing to fs-detectors', () => {
    expect(
      getVercelRuntimeRoutes('src/main.rs', {
        name: 'legacy-web',
        type: 'web',
      })
    ).toBeUndefined();
  });
});
