import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

import { ExperimentalTraceVersion } from './utils';

function getCustomData(importName: string, target: string) {
  return `
// @ts-nocheck
module.exports = function(...args) {
  let original = require('./${importName}');

  const finalConfig = {};
  const target = { target: '${target}' };

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

function getDefaultData(target: string) {
  return `
// @ts-nocheck
module.exports = { target: '${target}' };
  `.trim();
}

export default async function createServerlessConfig(
  workPath: string,
  entryPath: string,
  nextVersion: string | undefined
) {
  let target = 'serverless';

  if (nextVersion) {
    try {
      if (semver.gte(nextVersion, ExperimentalTraceVersion)) {
        target = 'experimental-serverless-trace';
      }
    } catch (
      _ignored
      // eslint-disable-next-line
    ) {}
  }
  const primaryConfigPath = path.join(entryPath, 'next.config.js');
  const secondaryConfigPath = path.join(workPath, 'next.config.js');
  const backupConfigName = `next.config.__vercel_builder_backup__.js`;

  const hasPrimaryConfig = fs.existsSync(primaryConfigPath);
  const hasSecondaryConfig = fs.existsSync(secondaryConfigPath);

  let configPath: string;
  let backupConfigPath: string;

  if (hasPrimaryConfig) {
    // Prefer primary path
    configPath = primaryConfigPath;
    backupConfigPath = path.join(entryPath, backupConfigName);
  } else if (hasSecondaryConfig) {
    // Work with secondary path (some monorepo setups)
    configPath = secondaryConfigPath;
    backupConfigPath = path.join(workPath, backupConfigName);
  } else {
    // Default to primary path for creation
    configPath = primaryConfigPath;
    backupConfigPath = path.join(entryPath, backupConfigName);
  }

  if (fs.existsSync(configPath)) {
    await fs.rename(configPath, backupConfigPath);
    await fs.writeFile(configPath, getCustomData(backupConfigName, target));
  } else {
    await fs.writeFile(configPath, getDefaultData(target));
  }
  return target;
}
