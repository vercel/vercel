// @flow
import elapsed from './elapsed';

// Returns a time delta with the right color
// example: `[103ms]`

module.exports = () => {
  const start = Date.now();
  return () => elapsed(Date.now() - start);
};
