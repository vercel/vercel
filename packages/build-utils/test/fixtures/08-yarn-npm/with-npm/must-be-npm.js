const fs = require('fs');
const path = require('path');

const execpath = path.basename(process.env.npm_execpath);
console.log('execpath', execpath);

if (execpath === 'npm-cli.js') {
  fs.writeFileSync(
    'index.js',
    'module.exports = (_, resp) => resp.end("npm:RANDOMNESS_PLACEHOLDER");',
  );
} else {
  throw new Error('npm is expected');
}
