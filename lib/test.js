// Native
const { resolve } = require('path');

// Ours
const { npm: getFiles } = require('./get-files');

getFiles(resolve('../mng-test/files-in-package'))
  .then(files => {
    console.log(files);

    getFiles(resolve('../mng-test/files-in-package-ignore'))
      .then(files2 => {
        console.log('ignored: ');
        console.log(files2);
      })
      .catch(err => {
        console.log(err.stack);
      });
  })
  .catch(err => {
    console.log(err.stack);
  });
