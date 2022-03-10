const { exec } = require('exeggcute');

const a = require('./a');
const b = require('./b');

a();
b();

exec('mkdir dist', __dirname);
exec('echo "node-env:RANDOMNESS_PLACEHOLDER" > dist/index.html', __dirname);
