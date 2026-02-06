export * from '../router';
export { createRoutes, Router, routes } from '../router';
export type {
  Condition,
  HeaderRule,
  Redirect,
  Rewrite,
  RouteType,
} from '../types';
export { VercelConfig } from '../types';
export {
  validateStaticBoolean,
  validateStaticFields,
  validateStaticObject,
  validateStaticString,
  validateStaticStringArray,
} from '../utils/validation';
