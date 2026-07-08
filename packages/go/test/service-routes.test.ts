import { getStandaloneServerRoutes } from '../src/standalone-server';

describe('V2 service routes', () => {
  it('routes a named V2 service to its isolated function', () => {
    expect(getStandaloneServerRoutes({ name: 'my-backend' })).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ]);
  });

  it.each([
    { label: 'a non-service build', service: undefined },
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
