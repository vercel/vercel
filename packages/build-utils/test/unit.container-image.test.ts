import { ContainerImage } from '../src';

describe('ContainerImage', () => {
  it('preserves function settings', () => {
    const image = new ContainerImage({
      files: {},
      handler: 'docker.io/library/nginx:1.27',
      runtime: 'container',
      environment: {},
      maxConcurrency: 8,
    });

    expect(image.maxConcurrency).toBe(8);
  });
});
