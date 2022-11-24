const path = require('node:path');
const fs = require('node:fs');

fs.rmSync('public', { recursive: true, force: true });
fs.mkdirSync('public');
fs.writeFileSync(path.join('public', 'index.txt'), `Hello, from build.js`);
