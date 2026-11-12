import {
  getStandaloneServerRoutes,
  STANDALONE_LAMBDA_PATH,
} from '../src/standalone-server';

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
    // The filesystem handler resolves `/` to an `index` output, which would
    // dispatch a rewrite landing on `/` before the transform below can run.
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
    // fs-detectors merges V1 services into one shared top-level table, where a
    // catch-all would shadow the sibling services.
    expect(getStandaloneServerRoutes(service)).toBeUndefined();
  });
});
