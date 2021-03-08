// Packages
const listen = require('test-listen');
const micro = require('micro');
console.log(micro);

module.exports = fn => {
  const srv = micro(fn);
  console.log({ srv });
  return listen(srv);
};
