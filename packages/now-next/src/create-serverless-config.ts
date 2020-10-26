import { Config } from '@vercel/build-utils';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

import { ExperimentalTraceVersion } from './utils';

function getCustomData(importName: string, target: string, config: Config) {
  return `
module.exports = function(...args) {
  let original = require('./${importName}');

  const finalConfig = {};
  const target = { target: '${target}' };
  const experimental = ${
    config.hasIntegrationPlugins ? '{ plugins: true }' : '{}'
  };

  if (typeof original === 'function' && original.constructor.name === 'AsyncFunction') {
    // AsyncFunctions will become promises
    original = original(...args);
  }

  if (original instanceof Promise) {
    // Special case for promises, as it's currently not supported
    // and will just error later on
    return original
      .then((orignalConfig) => Object.assign(finalConfig, orignalConfig))
      .then((config) => {
        Object.assign(config, target);
        config.experimental = Object.assign({}, config.experimental, experimental);
        return config;
      });
  } else if (typeof original === 'function') {
    Object.assign(finalConfig, original(...args));
  } else if (typeof original === 'object') {
    Object.assign(finalConfig, original);
  }

  Object.assign(finalConfig, target);
  finalConfig.experimental = Object.assign({}, finalConfig.experimental, experimental);

  return finalConfig;
}
  `.trim();
}

function getDefaultData(target: string, config: Config) {
  return `module.exports = ${JSON.stringify({
    target,
    ...(config.hasIntegrationPlugins
      ? { experimental: { plugins: true } }
      : undefined),
  })}`;
}

export default async function createServerlessConfig(
  workPath: string,
  entryPath: string,
  nextVersion: string | undefined,
  config: Config
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
    await fs.writeFile(
      configPath,
      getCustomData(backupConfigName, target, config)
    );
  } else {
    await fs.writeFile(configPath, getDefaultData(target, config));
  }
}
