const fs = require('fs');
const path = require('path');

const execpath = path.basename(process.env.npm_execpath);
console.log('execpath', execpath);

if (execpath === 'yarn.js' || execpath === 'yarn') {
  fs.writeFileSync(
    'index.js',
    'module.exports = (_, resp) => resp.end("yarn:RANDOMNESS_PLACEHOLDER");',
  );
} else {
  throw new Error('yarn is expected');
}
