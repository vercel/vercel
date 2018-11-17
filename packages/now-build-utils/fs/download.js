const path = require('path');
const FileFsRef = require('../file-fs-ref.js');

/** @typedef {import('../file-ref')} FileRef */
/** @typedef {import('../file-fs-ref')} FileFsRef */
/** @typedef {{[filePath: string]: FileRef|FileFsRef}} Files */
/** @typedef {{[filePath: string]: FileFsRef}|{}} DownloadedFiles */

/**
 * @param {FileRef|FileFsRef} file
 * @param {string} fsPath
 * @returns {Promise<FileFsRef>}
 */
async function downloadFile(file, fsPath) {
  const { mode } = file;
  const stream = file.toStream();
  return FileFsRef.fromStream({ mode, stream, fsPath });
}

/**
 * Download files to disk
 * @argument {Files} files
 * @argument {string} basePath
 * @returns {Promise<DownloadedFiles>}
 */
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
