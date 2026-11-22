import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { connectSubcommand } from '../../../../commands/storage/command';
import { STORAGE_AUTH_MODES } from '../../../storage/auth';

export class StorageConnectTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof connectSubcommand>
{
  trackCliArgumentStore(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'store',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProject(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(v: string[] | undefined) {
    if (v?.length) {
      this.trackCliOption({
        option: 'environment',
        value: this.redactedValue,
      });
    }
  }

  /** `--auth` is a closed enum, so the actual value is safe to record. */
  trackCliOptionAuth(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'auth',
        value: (STORAGE_AUTH_MODES as readonly string[]).includes(
          v.toLowerCase()
        )
          ? v.toLowerCase()
          : this.redactedValue,
      });
    }
  }

  trackCliFlagAddRwToken(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('add-rw-token');
    }
  }

  trackCliOptionPrefix(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'prefix',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagDryRun(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('dry-run');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
