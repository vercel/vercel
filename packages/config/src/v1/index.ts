export { createRoutes, routes, Router } from '../router';
export * from '../router';
export { VercelConfig } from '../types';
export type {
  Redirect,
  Rewrite,
  HeaderRule,
  Condition,
  RouteType,
} from '../types';
export {
  validateStaticString,
  validateStaticBoolean,
  validateStaticObject,
  validateStaticStringArray,
  validateStaticFields,
} from '../utils/validation';
