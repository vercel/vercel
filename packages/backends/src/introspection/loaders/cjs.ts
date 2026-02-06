import Module from 'module';
import { handle as handleExpress } from '../express.js';
import { handle as handleHono } from '../hono.js';

// Disabling network blocking logic while introspection is opt-in
// import './block-network.js';

const originalRequire = Module.prototype.require;

(Module.prototype.require as any) = function (
  this: any,
  id: string,
  ...args: any[]
) {
  const result = originalRequire.apply(this, [id, ...args] as [string]);

  if (id === 'express') {
    return handleExpress(result);
  }
  if (id === 'hono') {
    return {
      ...result,
      Hono: handleHono(result),
    };
  }

  return result;
};
