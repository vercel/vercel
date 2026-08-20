import { TelemetryClient } from '../..';
import type { putImageSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobPutImageTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof putImageSubcommand>
{
  trackCliArgumentPathToFileOrUrl(pathToFileOrUrl: string | undefined) {
    if (pathToFileOrUrl) {
      this.trackCliArgument({
        arg: 'pathToFileOrUrl',
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

  trackCliOptionWidth(width: number | undefined) {
    if (width !== undefined) {
      this.trackCliOption({
        option: 'width',
        value: String(width),
      });
    }
  }

  trackCliOptionQuality(quality: number | undefined) {
    if (quality !== undefined) {
      this.trackCliOption({
        option: 'quality',
        value: String(quality),
      });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }

  trackCliOptionPathname(pathname: string | undefined) {
    if (pathname) {
      this.trackCliOption({
        option: 'pathname',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAddRandomSuffix(addRandomSuffix: boolean | undefined) {
    if (addRandomSuffix) {
      this.trackCliFlag('add-random-suffix');
    }
  }

  trackCliFlagAllowOverwrite(allowOverwrite: boolean | undefined) {
    if (allowOverwrite) {
      this.trackCliFlag('allow-overwrite');
    }
  }

  trackCliOptionCacheControlMaxAge(cacheControlMaxAge: number | undefined) {
    if (cacheControlMaxAge) {
      this.trackCliOption({
        option: 'cache-control-max-age',
        value: String(cacheControlMaxAge),
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
