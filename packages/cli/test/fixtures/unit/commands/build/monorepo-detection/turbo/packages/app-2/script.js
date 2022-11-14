const path = require('node:path');
const fs = require('node:fs');

const dist = path.join(__dirname, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);
fs.writeFileSync(path.join(dist, 'index.js'), 'module.exports = "world"');
