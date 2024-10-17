import { Output } from './util/output';
import { OutputOptions } from './util/output/create-output';

let output = new Output(process.stderr, {
  debug: false,
  noColor: true,
});

export function outputInit(options: OutputOptions) {
  output.initialize(options);
}

/**
 * A managed singleton instance of the Output class.
 */
export default output;
