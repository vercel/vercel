import elapsed from './elapsed.js';

/**
 * Starts a timer and return a function that when called returns a string
 * with the ellapsed time formatted.
 */
export default (start: number = Date.now()) => {
  return (): string => elapsed(Date.now() - start);
};
