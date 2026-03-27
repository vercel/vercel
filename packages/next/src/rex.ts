import { Route } from '@vercel/routing-utils';

export function createRexRoute(bytecode: string): Route {
  return {
    src: '^.*$',
    middlewareRawSrc: [`rex:${bytecode}`],
  };
}

export function isRexRoute(route: Route): boolean {
  return !!(
    route.src &&
    'middlewareRawSrc' in route &&
    route.middlewareRawSrc?.[0]?.startsWith('rex:')
  );
}
