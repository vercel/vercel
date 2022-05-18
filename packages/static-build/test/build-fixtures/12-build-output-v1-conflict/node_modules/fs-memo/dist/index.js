'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const fs = require('fs');
const path = require('path');

const _memo = {
  _pid: process.pid
};
async function getMemo(config) {
  const options = getOptions(config);
  try {
    const memo = JSON.parse(await fs.promises.readFile(options.file, "utf-8")) || {};
    if (!memo._pid) {
      throw new Error("Memo lacks _pid");
    }
    if (memo._pid === _memo._pid || !isAlive(memo.pid)) {
      Object.assign(_memo, memo);
      _memo._pid = process.pid;
    }
  } catch (e) {
  }
  return _memo;
}
async function setMemo(memo, config) {
  const options = getOptions(config);
  Object.assign(_memo, memo);
  _memo._pid = process.pid;
  try {
    await fs.promises.mkdir(options.dir);
  } catch (e) {
  }
  try {
    await fs.promises.writeFile(options.file, JSON.stringify(_memo), "utf-8");
  } catch (e) {
  }
}
function getOptions(config) {
  const options = {...config};
  options.name = options.name || "default";
  options.dir = options.dir || path.resolve(process.cwd(), "node_modules/.cache/fs-memo");
  options.file = options.file || path.resolve(options.dir, options.name + ".json");
  return options;
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

exports.getMemo = getMemo;
exports.setMemo = setMemo;
