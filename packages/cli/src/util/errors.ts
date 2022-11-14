import { NowError } from './now-error';

interface SchemaValidationFailedMeta {
  message: string;
  keyword: string;
  dataPath: string;
  params: object;
}

export class SchemaValidationFailed extends NowError<
  'SCHEMA_VALIDATION_FAILED',
  SchemaValidationFailedMeta
> {
  constructor(
    message: string,
    keyword: string,
    dataPath: string,
    params: object
  ) {
    super({
      code: 'SCHEMA_VALIDATION_FAILED',
      meta: { message, keyword, dataPath, params },
      message: `Schema verification failed`,
    });
  }
}

interface InvalidLocalConfigMeta {
  value: string[];
}

export class InvalidLocalConfig extends NowError<
  'INVALID_LOCAL_CONFIG',
  InvalidLocalConfigMeta
> {
  constructor(value: string[]) {
    super({
      code: 'INVALID_LOCAL_CONFIG',
      meta: { value },
      message: `Invalid local config parameter [${value
        .map(localConfig => `"${localConfig}"`)
        .join(', ')}]. A string was expected.`,
    });
  }
}
