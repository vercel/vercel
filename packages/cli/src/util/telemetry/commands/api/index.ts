import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { apiCommand } from '../../../../commands/api/command';

export class ApiTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof apiCommand>
{
  trackCliArgumentEndpoint(endpoint: string | undefined) {
    if (endpoint) {
      // Normalize endpoint by replacing IDs with placeholders for privacy
      const normalized = this.normalizeEndpoint(endpoint);
      this.trackCliArgument({
        arg: 'endpoint',
        value: normalized,
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

  trackCliSubcommandList() {
    this.trackCliSubcommand({ subcommand: 'list', value: 'list' });
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      const validFormats = ['table', 'json'];
      const value = validFormats.includes(format) ? format : this.redactedValue;
      this.trackCliOption({
        option: 'format',
        value,
      });
    }
  }

  /**
   * Normalize endpoint by replacing IDs with placeholders for privacy
   */
  private normalizeEndpoint(endpoint: string): string {
    return endpoint
      .replace(/\/dpl_[a-zA-Z0-9]+/g, '/:deploymentId')
      .replace(/\/prj_[a-zA-Z0-9]+/g, '/:projectId')
      .replace(/\/team_[a-zA-Z0-9]+/g, '/:teamId')
      .replace(/\/[a-f0-9]{24}/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid');
  }
}
