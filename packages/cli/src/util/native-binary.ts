import type { GlobalConfig } from '@vercel-internals/types';
import type Client from './client';
import { writeToConfigFile } from './config/files';

export function isNativeBinaryEnabled(config: GlobalConfig): boolean {
  return config.useNativeBinary === true;
}

export function setUseNativeBinary(client: Client, enabled: boolean): void {
  client.config = {
    ...client.config,
    useNativeBinary: enabled,
  };

  writeToConfigFile(client.config);
}
