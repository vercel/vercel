import { describe, expect, it } from 'vitest';
import { FileBlob } from '@vercel/build-utils';
import { createNodeFunction } from '../src/build-vite';

// A route's exported `config` reaches the builder as the server bundle's
// config. Each field the bundle was split on must also end up on the function.
// See https://github.com/vercel/vercel/issues/17855.
describe('createNodeFunction()', () => {
  const create = (config: Record<string, unknown>) =>
    createNodeFunction({
      files: { 'index.mjs': new FileBlob({ data: 'export default {}' }) },
      handler: 'index.mjs',
      config: { runtime: 'nodejs', ...config },
      frameworkSlug: 'react-router',
      frameworkVersion: '7.0.0',
      nodeVersion: { major: 22, range: '22.x', runtime: 'nodejs22.x' },
    });

  it('forwards `supportsCancellation` from the route config', () => {
    const fn = create({ maxDuration: 300, supportsCancellation: true });

    expect(fn.supportsCancellation).toBe(true);
    expect(fn.maxDuration).toBe(300);
  });

  it('forwards the other function settings', () => {
    const fn = create({ memory: 1024, maxDuration: 60, regions: ['iad1'] });

    expect(fn.memory).toBe(1024);
    expect(fn.maxDuration).toBe(60);
    expect(fn.regions).toEqual(['iad1']);
  });

  it('leaves `supportsCancellation` unset when the route does not set it', () => {
    expect(create({}).supportsCancellation).toBeUndefined();
  });
});
