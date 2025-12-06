import { describe, expect, it } from 'vitest';
import { usingCorepack } from '../src/fs/run-user-scripts';

describe('usingCorepack', () => {
  describe('without `ENABLE_EXPERIMENTAL_COREPACK`', () => {
    it('should return false', () => {
      expect(usingCorepack({}, 'pnpm@10.24.0', false)).toEqual(false);
    });
  });
  describe('with `ENABLE_EXPERIMENTAL_COREPACK`', () => {
    describe('with Turborepo supporting `COREPACK_HOME`', () => {
      it('should return true', () => {
        expect(
          usingCorepack(
            { ENABLE_EXPERIMENTAL_COREPACK: '1' },
            'pnpm@10.24.0',
            true
          )
        ).toEqual(true);
      });
      describe('with Turborepo not supporting `COREPACK_HOME`', () => {
        it('should return false', () => {
          expect(
            usingCorepack(
              { ENABLE_EXPERIMENTAL_COREPACK: '1' },
              'pnpm@10.24.0',
              false
            )
          ).toEqual(false);
        });
      });
      describe('with Turborepo supporting `COREPACK_HOME`', () => {
        it('should return true', () => {
          expect(
            usingCorepack(
              { ENABLE_EXPERIMENTAL_COREPACK: '1' },
              'pnpm@10.24.0',
              true
            )
          ).toEqual(true);
        });
      });
    });
  });
});
