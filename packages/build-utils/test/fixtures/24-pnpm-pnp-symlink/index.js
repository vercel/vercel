const { exec } = require('exeggcute');

const a = require('./a');
const b = require('./b');

a();
b();

exec('mkdir public', __dirname);
exec('echo "Hello, World!" > public/index.html', __dirname);
