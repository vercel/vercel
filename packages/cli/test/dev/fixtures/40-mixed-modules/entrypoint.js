import { dep1 } from './js/ecmascript-module';

const { dep2 } = require('./js/commonjs-module');

module.exports = (req, res) => {
  if (req && typeof dep1 === 'string' && typeof dep2 === 'string') {
    res.end('mixed-modules:js');
  } else {
    res.end('import failed');
  }
};
