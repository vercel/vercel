import { Elysia } from 'elysia';

export const availabilityCheck = new Elysia()
  .get('/availabilityCheck', () => ({ message: 'ok' as const }))
  .head('/availabilityCheck', ({ set }) => {
    set.status = 200;
    return null;
  });
