import path from 'path';
import fs from 'fs-extra';

function getCustomData(importName: string) {
  return `
module.exports = function(...args) {
  let original = require('./${importName}');

  const finalConfig = {};
  const target = { target: 'serverless' };

  if (typeof original === 'function' && original.constructor.name === 'AsyncFunction') {
    // AsyncFunctions will become promises
    original = original(...args);
  }

  if (original instanceof Promise) {
    // Special case for promises, as it's currently not supported
    // and will just error later on
    return original
      .then((orignalConfig) => Object.assign(finalConfig, orignalConfig))
      .then((config) => Object.assign(config, target));
  } else if (typeof original === 'function') {
    Object.assign(finalConfig, original(...args));
  } else if (typeof original === 'object') {
    Object.assign(finalConfig, original);
  }

  Object.assign(finalConfig, target);

  return finalConfig;
}
  `.trim();
}

function getDefaultData() {
  return `module.exports = { target: 'serverless' };`;
}

export default async function createServerlessConfig(workPath: string) {
  const configPath = path.join(workPath, 'next.config.js');
  const backupConfigName = `next.config.original.${Date.now()}.js`;
  const backupConfigPath = path.join(workPath, backupConfigName);

  if (fs.existsSync(configPath)) {
    await fs.rename(configPath, backupConfigPath);
    await fs.writeFile(configPath, getCustomData(backupConfigName));
  } else {
    await fs.writeFile(configPath, getDefaultData());
  }
}
