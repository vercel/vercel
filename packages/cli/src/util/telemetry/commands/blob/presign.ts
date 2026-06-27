import { TelemetryClient } from '../..';
import type { presignSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobPresignTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof presignSubcommand>
{
  trackCliArgumentPathname(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'pathname',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAccess(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'access',
        value,
      });
    }
  }

  trackCliOptionOperation(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'operation',
        value,
      });
    }
  }

  trackCliOptionDelegationToken(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'delegation-token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionClientSigningToken(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'client-signing-token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionValidUntil(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'valid-until',
        value: String(value),
      });
    }
  }

  trackCliOptionValidFor(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'valid-for',
        value,
      });
    }
  }

  trackCliOptionIfMatch(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'if-match',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAllowOverwrite(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('allow-overwrite');
    }
  }

  trackCliFlagAddRandomSuffix(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('add-random-suffix');
    }
  }

  trackCliOptionCacheControlMaxAge(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'cache-control-max-age',
        value: String(value),
      });
    }
  }

  trackCliOptionAllowedContentType(value: string[] | undefined) {
    if (value && value.length > 0) {
      this.trackCliOption({
        option: 'allowed-content-type',
        value: value.join(','),
      });
    }
  }

  trackCliOptionMaximumSizeInBytes(value: number | undefined) {
    if (value !== undefined) {
      this.trackCliOption({
        option: 'maximum-size-in-bytes',
        value: String(value),
      });
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }
}
