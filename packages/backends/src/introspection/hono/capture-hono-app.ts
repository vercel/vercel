import { extendHono } from '.';

export const captureHonoApp = (honoModule: any) => {
  const Hono = extendHono(honoModule.Hono);
  return Hono;
};
