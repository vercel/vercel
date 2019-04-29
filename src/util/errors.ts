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
      message: `Schema verification failed`
    });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-empty-interface */
interface InvalidAllForScaleMeta {}

export class InvalidAllForScale extends NowError<
  'INVALID_ALL_FOR_SCALE',
  InvalidAllForScaleMeta
> {
  constructor() {
    super({
      code: 'INVALID_ALL_FOR_SCALE',
      meta: {},
      message: `You can't use all in the regions list mixed with other regions`
    });
  }
}

interface InvalidRegionOrDCForScaleMeta {
  regionOrDC: string;
}

export class InvalidRegionOrDCForScale extends NowError<
  'INVALID_REGION_OR_DC_FOR_SCALE',
  InvalidRegionOrDCForScaleMeta
> {
  constructor(regionOrDC: string) {
    super({
      code: 'INVALID_REGION_OR_DC_FOR_SCALE',
      meta: { regionOrDC },
      message: `Invalid region or DC "${regionOrDC}" provided`
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
        .join(', ')}]. A string was expected.`
    });
  }
}
