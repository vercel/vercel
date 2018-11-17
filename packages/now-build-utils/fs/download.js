const path = require('path');
const FileFsRef = require('../file-fs-ref.js');

async function downloadFile(file, fsPath) {
  const { mode } = file;
  const stream = file.toStream();
  return FileFsRef.fromStream({ mode, stream, fsPath });
}

module.exports = async function download(files, basePath) {
  const files2 = {};

  await Promise.all(
    Object.keys(files).map(async (name) => {
      const file = files[name];
      const fsPath = path.join(basePath, name);
      files2[name] = await downloadFile(file, fsPath);
    }),
  );

  return files2;
};
