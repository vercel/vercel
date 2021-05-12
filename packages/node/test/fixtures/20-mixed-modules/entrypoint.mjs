import { dep1 } from './js/em-jay-ess.mjs';

 async function handler(req, res) {
  const cjs = await import('./js/commonjs-module.js');
  if (req && dep1 === 'dep1' && cjs?.default?.dep2 === 'dep2') {
    res.end('mixed-modules:mjs:RANDOMNESS_PLACEHOLDER');
  } else {
    res.end('import failed');
  }
};

export default handler;
