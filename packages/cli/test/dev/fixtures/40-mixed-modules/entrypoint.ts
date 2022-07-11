import { IncomingMessage, ServerResponse } from 'http';
import { dep1 } from './ts/ecmascript-module';
const { dep2 } = require('./ts/commonjs-module');

module.exports = (req: IncomingMessage, res: ServerResponse) => {
  if (req && typeof dep1 === 'string' && typeof dep2 === 'string') {
    res.end('mixed-modules:ts');
  } else {
    res.end('import failed');
  }
};
