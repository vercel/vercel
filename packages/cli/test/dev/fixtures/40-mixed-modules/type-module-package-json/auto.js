import { dep1 } from '../js/em-jay-ess.mjs';

async function handler(_req, res) {
  const cjs = await import('../js/commonjs-module.js');
  if (dep1 === 'dep1' && cjs.default && cjs.default.dep2 === 'dep2') {
    res.end('mixed-modules:auto');
  } else {
    res.end('import failed');
  }
}

export default handler;
