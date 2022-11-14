const { exec } = require('exeggcute');

const a = require('./a');
const b = require('./b');

a();
b();

exec('mkdir public', __dirname)
  .then(() => {
    exec('echo "Hello, World!" > public/index.html', __dirname).then(() => {
      console.log('Success');
    });
  })
  .catch(console.error);
