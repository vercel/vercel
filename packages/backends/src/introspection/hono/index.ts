import type { Hono } from 'hono';

let app: Hono | null = null;

export const extendHono = (honoModule: any) => {
  const TrackedHono = class extends honoModule {
    constructor(...args: any[]) {
      super(...args);

      // eslint-disable-next-line
      app = this as unknown as Hono;
    }
  };
  return TrackedHono;
};

process.on('beforeExit', () => {
  if (app) {
    console.log('[@vercel/backends] ✓ Hono app captured');
    console.log({ app });
  }
});
