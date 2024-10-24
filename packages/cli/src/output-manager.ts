import { Output } from './util/output';

let output = new Output(process.stderr, {
  debug: false,
});

/**
 * A managed singleton instance of the Output class.
 */
export default output;
