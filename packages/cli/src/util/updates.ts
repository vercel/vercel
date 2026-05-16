import ciInfo from 'ci-info';
import type { GlobalConfig } from '@vercel-internals/types';
import type Client from './client';
import { writeToConfigFile } from './config/files';
import { isGlobal } from './get-update-command';

export function isAutoUpdateEnabled(config: GlobalConfig): boolean {
  return config.updates?.auto === true;
}

export function hasAutoUpdatePreference(config: GlobalConfig): boolean {
  return typeof config.updates?.auto === 'boolean';
}

export function setAutoUpdate(client: Client, enabled: boolean): void {
  client.config = {
    ...client.config,
    updates: {
      ...client.config.updates,
      auto: enabled,
    },
  };

  writeToConfigFile(client.config);
}

export async function canAutoUpdate(
  client: Client,
  exitCode: number,
  command?: string
) {
  if (!isAutoUpdateEnabled(client.config)) {
    return false;
  }

  if (exitCode !== 0) {
    return false;
  }

  if (ciInfo.isCI) {
    return false;
  }

  if (client.nonInteractive || client.isAgent) {
    return false;
  }

  if (command === 'upgrade') {
    return false;
  }

  return isGlobal();
}
