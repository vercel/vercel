const FileBlob = require('@now/build-utils/file-blob.js');
const OptiPng = require('optipng');
const pipe = require('multipipe');

exports.analyze = ({ files, entrypoint }) => {
  return files[entrypoint].digest;
};

exports.build = async ({ files, entrypoint }) => {
  const optimizer = new OptiPng([ '-o9' ]);
  const stream = pipe(files[entrypoint].toStream(), optimizer);
  const result = await FileBlob.fromStream({ stream });
  return { [entrypoint]: result };
};
