const path = require('node:path');
const fs = require('node:fs');

const public = path.join(__dirname, 'public');
fs.rmSync(public, { recursive: true, force: true });
fs.mkdirSync(public);
fs.writeFileSync(path.join(public, 'index.txt'), `Hello, world`);
