import { describe, expect, it } from 'vitest';
import { getConfigTelemetryEvents } from '../../../../src/util/telemetry/config';

describe('getConfigTelemetryEvents', () => {
  it('reports explicitly configured rollout preferences', () => {
    expect(
      getConfigTelemetryEvents({
        updates: { auto: false, bypassMinReleaseAge: true },
        credStorage: 'keyring',
      })
    ).toEqual([
      { key: 'config_auto_update', value: 'disabled' },
      { key: 'config_bypass_min_release_age', value: 'enabled' },
      { key: 'config_credential_storage', value: 'keyring' },
    ]);
  });

  it('distinguishes unset preferences from disabled preferences', () => {
    expect(getConfigTelemetryEvents({})).toEqual([
      { key: 'config_auto_update', value: 'unset' },
      { key: 'config_bypass_min_release_age', value: 'unset' },
      { key: 'config_credential_storage', value: 'unset' },
    ]);
  });
});
