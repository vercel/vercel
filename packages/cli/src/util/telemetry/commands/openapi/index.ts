import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { openapiCommand } from '../../../../commands/openapi/command';

export class OpenapiTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof openapiCommand>
{
  trackCliArgumentTag(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'tag',
        value,
      });
    }
  }

  trackCliArgumentOperationId(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'operationId',
        value,
      });
    }
  }

  trackCliOptionMethod(method: string | undefined) {
    if (method) {
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
      const upperMethod = method.toUpperCase();
      const value = validMethods.includes(upperMethod)
        ? upperMethod
        : this.redactedValue;
      this.trackCliOption({
        option: 'method',
        value,
      });
    }
  }

  trackCliOptionField(fields: string[] | undefined) {
    if (fields && fields.length > 0) {
      this.trackCliOption({
        option: 'field',
        value: this.redactedArgumentsLength(fields),
      });
    }
  }

  trackCliOptionRawField(fields: string[] | undefined) {
    if (fields && fields.length > 0) {
      this.trackCliOption({
        option: 'raw-field',
        value: this.redactedArgumentsLength(fields),
      });
    }
  }

  trackCliOptionHeader(headers: string[] | undefined) {
    if (headers && headers.length > 0) {
      this.trackCliOption({
        option: 'header',
        value: this.redactedArgumentsLength(headers),
      });
    }
  }

  trackCliOptionInput(input: string | undefined) {
    if (input) {
      const value = input === '-' ? 'stdin' : 'file';
      this.trackCliOption({
        option: 'input',
        value,
      });
    }
  }

  trackCliFlagPaginate(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('paginate');
    }
  }

  trackCliFlagInclude(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('include');
    }
  }

  trackCliFlagSilent(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('silent');
    }
  }

  trackCliFlagVerbose(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('verbose');
    }
  }

  trackCliFlagRaw(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('raw');
    }
  }

  trackCliFlagRefresh(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('refresh');
    }
  }

  trackCliOptionGenerate(format: string | undefined) {
    if (format) {
      const validFormats = ['curl'];
      const value = validFormats.includes(format) ? format : this.redactedValue;
      this.trackCliOption({
        option: 'generate',
        value,
      });
    }
  }

  trackCliFlagDangerouslySkipPermissions(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('dangerously-skip-permissions');
    }
  }

  trackCliFlagDescribe(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('describe');
    }
  }
}
