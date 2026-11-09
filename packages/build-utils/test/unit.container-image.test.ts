import { ContainerImage } from '../src/container-image';

describe('ContainerImage', () => {
  it.each([undefined, 1, 8192])('accepts concurrency %s', maxConcurrency => {
    const image = new ContainerImage({
      files: {},
      handler: 'test',
      runtime: 'container',
      maxConcurrency,
    });
    expect(image.maxConcurrency).toBe(maxConcurrency);
  });
  it.each([
    0,
    -1,
    1.5,
    8193,
    1e20,
    1e30,
    NaN,
    Infinity,
  ])('rejects concurrency %s', maxConcurrency => {
    expect(
      () =>
        new ContainerImage({
          files: {},
          handler: 'test',
          runtime: 'container',
          maxConcurrency,
        })
    ).toThrow('"maxConcurrency" must be an integer from 1 to 8192');
  });
  it('preserves function settings', () => {
    const image = new ContainerImage({
      files: {},
      handler: 'docker.io/library/nginx:1.27',
      runtime: 'container',
      architecture: 'arm64',
      memory: 2048,
      maxDuration: 60,
      maxConcurrency: 8,
      regions: ['iad1'],
      functionFailoverRegions: ['cle1'],
      supportsCancellation: true,
    });

    expect(image).toMatchObject({
      environment: {},
      architecture: 'arm64',
      memory: 2048,
      maxDuration: 60,
      maxConcurrency: 8,
      regions: ['iad1'],
      functionFailoverRegions: ['cle1'],
      supportsCancellation: true,
    });
  });
});
