const { PCRE } = require('pcre-to-regexp');

// `ts-node` default "target" is "es5" which transpiles `class` statements and
// is incompatible with dependencies that use ES6 native `class`. Setting the
// "target" to "es2018" or newer prevents the `class` transpilation.
//
// See: https://github.com/vercel/vercel/discussions/4724
// See: https://github.com/TypeStrong/ts-node/issues/903
class P extends PCRE {}

export default (req, res) => {
  const p = new P('hi'); // This line should not throw an error
  console.log(p);
  res.send({ ok: true });
};
