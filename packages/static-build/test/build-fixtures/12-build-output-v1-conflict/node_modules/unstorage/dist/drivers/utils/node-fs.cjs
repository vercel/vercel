"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ensuredir = ensuredir;
exports.readFile = readFile;
exports.readdir = readdir;
exports.readdirRecursive = readdirRecursive;
exports.rmRecursive = rmRecursive;
exports.stat = stat;
exports.unlink = unlink;
exports.writeFile = writeFile;

var _fs = require("fs");

var _path = require("path");

function ignoreNotfound(err) {
  return err.code === "ENOENT" || err.code === "EISDIR" ? null : err;
}

function ignoreExists(err) {
  return err.code === "EEXIST" ? null : err;
}

async function writeFile(path, data) {
  await ensuredir((0, _path.dirname)(path));
  return _fs.promises.writeFile(path, data, "utf8");
}

function readFile(path) {
  return _fs.promises.readFile(path, "utf8").catch(ignoreNotfound);
}

function stat(path) {
  return _fs.promises.stat(path).catch(ignoreNotfound);
}

function unlink(path) {
  return _fs.promises.unlink(path).catch(ignoreNotfound);
}

function readdir(dir) {
  return _fs.promises.readdir(dir, {
    withFileTypes: true
  }).catch(ignoreNotfound).then(r => r || []);
}

async function ensuredir(dir) {
  if ((0, _fs.existsSync)(dir)) {
    return;
  }

  await ensuredir((0, _path.dirname)(dir)).catch(ignoreExists);
  await _fs.promises.mkdir(dir).catch(ignoreExists);
}

async function readdirRecursive(dir, ignore) {
  if (ignore && ignore(dir)) {
    return [];
  }

  const entries = await readdir(dir);
  const files = [];
  await Promise.all(entries.map(async entry => {
    const entryPath = (0, _path.resolve)(dir, entry.name);

    if (entry.isDirectory()) {
      const dirFiles = await readdirRecursive(entryPath, ignore);
      files.push(...dirFiles.map(f => entry.name + "/" + f));
    } else {
      if (ignore && !ignore(entry.name)) {
        files.push(entry.name);
      }
    }
  }));
  return files;
}

async function rmRecursive(dir) {
  const entries = await readdir(dir);
  await Promise.all(entries.map(entry => {
    const entryPath = (0, _path.resolve)(dir, entry.name);

    if (entry.isDirectory()) {
      return rmRecursive(entryPath).then(() => _fs.promises.rmdir(entryPath));
    } else {
      return _fs.promises.unlink(entryPath);
    }
  }));
}