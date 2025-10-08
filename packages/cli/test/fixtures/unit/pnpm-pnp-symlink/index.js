const { exec } = require('exeggcute');
const path = require('path');
const { existsSync, writeFileSync } = require('fs');

const a = require('./a');
const b = require('./b');

a();
b();

exec('mkdir public', __dirname)
  .then(() => {
    const cacheFile = path.join(__dirname, 'node_modules/.was-cached');
    const cacheExists = existsSync(cacheFile);
    exec(
      `echo ${cacheExists ? 'cache exists' : 'no cache'} > public/index.html`,
      __dirname
    ).then(() => {
      console.log('Success');
      writeFileSync(cacheFile, '1');
    });
  })
  .catch(console.error);
