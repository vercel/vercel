import jest from 'jest-cli';
import path from 'path';
import packageJson from '../../package.json';

import { CLIOptions } from 'aurelia-cli';

export default (cb) => {
  let options = packageJson.jest;

  if (CLIOptions.hasFlag('watch')) {
    Object.assign(options, { watchAll: true});
  }

  process.env.BABEL_TARGET = 'node';

  jest.runCLI(options, [path.resolve(__dirname, '../../')]).then(({ results }) => {
    if (results.numFailedTests || results.numFailedTestSuites) {
      cb('Tests Failed');
    } else {
      cb();
    }
  });
};
