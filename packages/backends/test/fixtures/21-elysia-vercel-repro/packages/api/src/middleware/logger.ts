import { Elysia } from 'elysia';

export const logger = new Elysia({ name: 'logger' }).onRequest(
  ({ request }) => {
    console.log(`[api] ${request.method} ${request.url}`);
  },
);
