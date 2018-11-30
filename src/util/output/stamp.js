//      
import elapsed from './elapsed';

// Returns a time delta with the right color
// example: `[103ms]`

export default () => {
  const start = Date.now();
  return () => elapsed(Date.now() - start);
};
