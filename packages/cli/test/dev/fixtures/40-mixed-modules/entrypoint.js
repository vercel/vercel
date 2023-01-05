module.exports = async (req, res) => {
  const { dep1 } = await import('./js/em-jay-ess.mjs');
  const { dep2 } = require('./js/commonjs-module.js');
  if (req && typeof dep1 === 'string' && typeof dep2 === 'string') {
    res.end('mixed-modules:js');
  } else {
    res.end('import failed');
  }
};
