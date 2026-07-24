import { TelemetryClient } from '../..';

/**
 * The auth options (--rw-token, --oidc-token, --store-id) are shared by all
 * `blob` subcommands that talk to a Blob store and are parsed and tracked
 * once at the `blob` command level. Each subcommand still declares them in
 * its options for help output, so the telemetry interfaces derived from
 * those options require these methods on every subcommand client.
 */
export class BlobAuthTelemetryClient extends TelemetryClient {
  trackCliOptionRwToken(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: '--rw-token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionOidcToken(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: '--oidc-token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionStoreId(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: '--store-id',
        value: this.redactedValue,
      });
    }
  }
}
