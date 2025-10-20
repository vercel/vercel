import Module from 'module';
import { extendHono } from '../hono/index.js';
import { extendExpress } from '../express/index.js';

const originalRequire = Module.prototype.require;

(Module.prototype.require as any) = function (
  this: any,
  id: string,
  ...args: any[]
) {
  const result = originalRequire.apply(this, [id, ...args] as [string]);

  if (id === 'express') {
    return extendExpress(result);
  }
  if (id === 'hono') {
    return {
      ...result,
      Hono: extendHono(result.Hono),
    };
  }

  return result;
};
