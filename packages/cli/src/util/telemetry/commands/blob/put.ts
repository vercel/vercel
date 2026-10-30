import { TelemetryClient } from '../..';
import type { putSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobPutTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof putSubcommand>
{
  trackCliOptionAccess(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'access',
        value,
      });
    }
  }

  trackCliArgumentPathToFile(pathToFile: string | undefined) {
    if (pathToFile) {
      this.trackCliArgument({
        arg: 'pathToFile',
        value: this.redactedValue,
      });
    }
  }

  trackCliInputSourceStdin() {
    this.trackCliArgument({
      arg: 'pathToFile',
      value: '__vercel_stdin__',
    });
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
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagMultipart(multipart: boolean | undefined) {
    if (multipart) {
      this.trackCliFlag('multipart');
    }
  }

  trackCliFlagNoMultipart(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('no-multipart');
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

  // The deprecated name keeps its own key, to measure who still uses it.
  trackCliFlagAllowOverwrite(allowOverwrite: boolean | undefined) {
    if (allowOverwrite) {
      this.trackCliFlag('allow-overwrite');
    }
  }

  trackCliOptionIfMatch(ifMatch: string | undefined) {
    if (ifMatch) {
      this.trackCliOption({
        option: 'if-match',
        value: this.redactedValue,
      });
    }
  }
}
