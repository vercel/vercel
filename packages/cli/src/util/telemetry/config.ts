import type { GlobalConfig } from '@vercel-internals/types';

type ConfigPreference = 'enabled' | 'disabled' | 'unset';

function configPreference(value: boolean | undefined): ConfigPreference {
  if (value === undefined) return 'unset';
  return value ? 'enabled' : 'disabled';
}

export function getConfigTelemetryEvents(
  config: GlobalConfig
): Array<{ key: string; value: string }> {
  return [
    {
      key: 'config_auto_update',
      value: configPreference(config.updates?.auto),
    },
    {
      key: 'config_bypass_min_release_age',
      value: configPreference(config.updates?.bypassMinReleaseAge),
    },
    {
      key: 'config_credential_storage',
      value: config.credStorage ?? 'unset',
    },
  ];
}
