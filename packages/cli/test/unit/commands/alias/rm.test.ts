import { describe, it } from 'vitest';

describe('alias rm', () => {
  describe('no argument', () => {
    it.todo('errors');
  });
  describe('[ALIAS]', () => {
    it.todo('removes the alias');

    describe('invalid alias', () => {
      it.todo('errors');
    });

    describe('the alias cannot be found', () => {
      it.todo('errors');
    });

    describe('--yes', () => {
      it.todo('skips confirmation step');
    });
  });
});
