/**
 * Manually describe the bits of `express` we use because:
 * - `body-parser` has a vulnerability report: https://github.com/vercel/vercel/security/dependabot/5504
 * - which is a transitive dependency of `express` and `@types/express`
 * - we need to update to `express@4.21.1` to update `body-parser` past the patched version
 * - the corresponding `@types/express` package doesn't exist
 * - the latest `@types/express` package still has an affected `body-parser` version
 * So, we removed `@types/express` from this package.
 */
declare module 'express' {
  import type { RequestListener } from 'http';

  export type Request = Request;
  export type Response = Response;
  type Handler = (
    request: Request,
    response: Response,
    next?: Function?
  ) => void;

  type ExpressRequestListener = RequestListener & {
    use: (handler: Handler) => void;
    json: () => Handler;
  };

  export type Express = {};

  // use declaration merging to type an Object Function
  function ExpressConstructor(): ExpressRequestListener;
  namespace ExpressConstructor {
    export function json(): Handler;
  }
  export default ExpressConstructor;

  export type ExpressRouter = {
    (request: Request, response: Response, next?: Function?): void;
    get(path: string, handler: Handler);
    post(path: string, handler: Handler);
    delete(path: string, handler: Handler);
    patch(path: string, handler: Handler);
    put(path: string, handler: Handler);
  };
  export function Router(): ExpressRouter;
}
