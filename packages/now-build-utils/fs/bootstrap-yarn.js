const MemoryFileSystem = require('memory-fs');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const yarnPath = spawnSync('which', ['yarn'])
  .stdout.toString()
  .trim();

const cachePath = spawnSync(yarnPath, ['cache', 'dir'])
  .stdout.toString()
  .trim();

spawnSync(yarnPath, ['cache', 'clean']);
const vfs = new MemoryFileSystem();

function isOutsideCachePath(filename) {
  const relative = path.relative(cachePath, filename);
  return relative.startsWith('..');
}

const saveCreateWriteStream = fs.createWriteStream;
fs.createWriteStream = (...args) => {
  const filename = args[0];
  if (isOutsideCachePath(filename)) {
    return saveCreateWriteStream.call(fs, ...args);
  }

  vfs.mkdirpSync(path.dirname(filename));
  fs.writeFileSync(filename, Buffer.alloc(0));
  const stream = vfs.createWriteStream(...args);

  stream.on('finish', () => {
    setTimeout(() => {
      stream.emit('close');
    });
  });

  return stream;
};

const saveReadFile = fs.readFile;
fs.readFile = (...args) => {
  const filename = args[0];
  if (isOutsideCachePath(filename)) {
    return saveReadFile.call(fs, ...args);
  }

  const callback = args[args.length - 1];
  return vfs.readFile(...args.slice(0, -1), (error, result) => {
    if (error) {
      saveReadFile.call(fs, ...args);
      return;
    }

    callback(error, result);
  });
};

const saveCopyFile = fs.copyFile;
fs.copyFile = (...args) => {
  const src = args[0];
  if (isOutsideCachePath(src)) {
    return saveCopyFile.call(fs, ...args);
  }

  const dest = args[1];
  const callback = args[args.length - 1];
  const buffer = vfs.readFileSync(src);
  return fs.writeFile(dest, buffer, callback);
};

const saveWriteFile = fs.writeFile;
fs.writeFile = (...args) => {
  const filename = args[0];
  if (isOutsideCachePath(filename)) {
    return saveWriteFile.call(fs, ...args);
  }

  return vfs.writeFile(...args);
};

require(yarnPath);
