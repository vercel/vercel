import { Output } from './util/output';

let output = new Output(process.stderr, {
  debug: false,
  noColor: true,
});

/**
 * A managed singleton instance of the Output class.
 */
export default output;
