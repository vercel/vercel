import { Elysia } from 'elysia';
import { CommonErrors } from '@repro/shared/errors';

export const errorHandler = new Elysia({ name: 'errorHandler' }).onError(
  ({ error, set, code }) => {
    console.error('[api] error', code, error);
    if (set.status === undefined || set.status === 200) {
      set.status = 500;
    }
    return {
      message:
        (error as { message?: string }).message ?? CommonErrors.INTERNAL_ERROR,
    };
  },
);
