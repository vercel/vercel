import { ContainerImage } from '../src/container-image';

describe('ContainerImage', () => {
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
