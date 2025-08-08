import { describe, it, expect } from 'vitest';
import type { EnvRecordsSource } from '../../../../src/util/env/get-env-records';

describe('get-env-records', () => {
  describe('EnvRecordsSource', () => {
    it('should include vercel-cli:link as a valid source', () => {
      const linkSource: EnvRecordsSource = 'vercel-cli:link';
      expect(linkSource).toBe('vercel-cli:link');
    });

    it('should include all expected sources', () => {
      const expectedSources: EnvRecordsSource[] = [
        'vercel-cli:env:add',
        'vercel-cli:env:rm',
        'vercel-cli:env:pull',
        'vercel-cli:dev',
        'vercel-cli:pull',
        'vercel-cli:link',
      ];

      expectedSources.forEach(source => {
        const validSource: EnvRecordsSource = source;
        expect(typeof validSource).toBe('string');
      });
    });
  });
});
