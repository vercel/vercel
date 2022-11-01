const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, 'dist');

fs.rmSync(outDir, { recursive: true, force: true });
