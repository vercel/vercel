import type { Express } from 'express';

let app: Express | null = null;

export const extendExpress = (expressModule: any) => {
  if (typeof expressModule === 'function') {
    const originalCreateApp = expressModule;
    const createApp = (...args: any[]) => {
      const newApp = originalCreateApp(...args);
      app = newApp;
      return newApp;
    };
    return createApp;
  }
  return expressModule;
};

process.on('beforeExit', () => {
  if (app) {
    console.log('[@vercel/backends] ✓ Express app captured');
    console.log({ app });
  }
});
