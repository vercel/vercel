import { Output } from './util/output';

const output = new Output(process.stderr, {
  debug: process.env.VERCEL_CLI_DEBUG === '1',
});

/**
 * A managed singleton instance of the Output class.
 */
export default output;
