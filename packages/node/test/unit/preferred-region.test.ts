import { describe, it, expect } from 'vitest';
import { prepareFilesystem } from './test-utils';
import { build } from '../../src';
import type { NodejsLambda } from '@vercel/build-utils';
import type { EdgeFunction } from '@vercel/build-utils';

describe('preferredRegion', () => {
  describe('edge runtime', () => {
    it('should pass through regions for edge functions', async () => {
      const filesystem = await prepareFilesystem({
        'api/edge.js': `
          export const config = {
            runtime: 'edge',
            regions: ['iad1', 'sfo1'],
          };
          export default (req) => new Response('edge');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/edge.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('EdgeFunction');
      expect((buildResult.output as EdgeFunction).regions).toEqual([
        'iad1',
        'sfo1',
      ]);
    });

    it('should handle single region in array for edge functions', async () => {
      const filesystem = await prepareFilesystem({
        'api/edge.js': `
          export const config = {
            runtime: 'edge',
            regions: ['iad1'],
          };
          export default (req) => new Response('edge');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/edge.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('EdgeFunction');
      expect((buildResult.output as EdgeFunction).regions).toEqual(['iad1']);
    });
  });

  describe('nodejs runtime', () => {
    it('should set regions from preferredRegion array', async () => {
      const filesystem = await prepareFilesystem({
        'api/node.js': `
          export const config = {
            preferredRegion: ['iad1', 'sfo1'],
          };
          export default (req, res) => res.send('node');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/node.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('Lambda');
      expect((buildResult.output as NodejsLambda).regions).toEqual([
        'iad1',
        'sfo1',
      ]);
    });

    it('should wrap single region string in array', async () => {
      const filesystem = await prepareFilesystem({
        'api/node.js': `
          export const config = {
            preferredRegion: 'iad1',
          };
          export default (req, res) => res.send('node');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/node.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('Lambda');
      expect((buildResult.output as NodejsLambda).regions).toEqual(['iad1']);
    });

    it('should convert "all" to ["all"]', async () => {
      const filesystem = await prepareFilesystem({
        'api/node.js': `
          export const config = {
            preferredRegion: 'all',
          };
          export default (req, res) => res.send('node');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/node.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('Lambda');
      expect((buildResult.output as NodejsLambda).regions).toEqual(['all']);
    });

    it('should set regions to undefined for "auto"', async () => {
      const filesystem = await prepareFilesystem({
        'api/node.js': `
          export const config = {
            preferredRegion: 'auto',
          };
          export default (req, res) => res.send('node');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/node.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('Lambda');
      expect((buildResult.output as NodejsLambda).regions).toBeUndefined();
    });

    it('should set regions to undefined for "default"', async () => {
      const filesystem = await prepareFilesystem({
        'api/node.js': `
          export const config = {
            preferredRegion: 'default',
          };
          export default (req, res) => res.send('node');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/node.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('Lambda');
      expect((buildResult.output as NodejsLambda).regions).toBeUndefined();
    });

    it('should fallback to regions if preferredRegion is not set', async () => {
      const filesystem = await prepareFilesystem({
        'api/node.js': `
          export const config = {
            regions: ['iad1'],
          };
          export default (req, res) => res.send('node');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/node.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('Lambda');
      expect((buildResult.output as NodejsLambda).regions).toEqual(['iad1']);
    });

    it('should prefer preferredRegion over regions', async () => {
      const filesystem = await prepareFilesystem({
        'api/node.js': `
          export const config = {
            preferredRegion: ['sfo1'],
            regions: ['iad1'],
          };
          export default (req, res) => res.send('node');
        `,
      });

      const buildResult = await build({
        ...filesystem,
        entrypoint: 'api/node.js',
        config: {},
        meta: { skipDownload: true },
      });

      expect(buildResult.output).toBeDefined();
      expect(buildResult.output.type).toBe('Lambda');
      expect((buildResult.output as NodejsLambda).regions).toEqual(['sfo1']);
    });
  });
});
