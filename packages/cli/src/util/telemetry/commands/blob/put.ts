import { TelemetryClient } from '../..';
import type { putSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobPutTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof putSubcommand>
{
  trackCliArgumentPathToFile(pathToFile: string | undefined) {
    if (pathToFile) {
      this.trackCliArgument({
        arg: 'pathToFile',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagAddRandomSuffix(addRandomSuffix: boolean | undefined) {
    if (addRandomSuffix) {
      this.trackCliFlag('add-random-suffix');
    }
  }

  trackCliOptionPathname(pathname: string | undefined) {
    if (pathname) {
      this.trackCliOption({
        option: 'pathname',
        value: pathname,
      });
    }
  }

  trackCliFlagMultipart(multipart: boolean | undefined) {
    if (multipart) {
      this.trackCliFlag('multipart');
    }
  }

  trackCliOptionContentType(contentType: string | undefined) {
    if (contentType) {
      this.trackCliOption({
        option: 'content-type',
        value: contentType,
      });
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

  trackCliFlagForce(force: boolean | undefined) {
    if (force) {
      this.trackCliFlag('force');
    }
  }
}
