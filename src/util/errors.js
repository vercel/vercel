import { NowError } from './now-error';

export class DNSPermissionDenied extends NowError {
  constructor(domain) {
    super({
      code: 'DNS_PERMISSION_DENIED',
      meta: { domain },
      message: `You don't have access to the DNS records of ${domain}.`
    });
  }
}

export class SchemaValidationFailed extends NowError {
  constructor(message, keyword, dataPath, params) {
    super({
      code: 'SCHEMA_VALIDATION_FAILED',
      meta: { message, keyword, dataPath, params },
      message: `Schema verification failed`
    });
  }
}

export class InvalidAllForScale extends NowError                              {
  constructor() {
    super({
      code: 'INVALID_ALL_FOR_SCALE',
      meta: {},
      message: `You can't use all in the regions list mixed with other regions`
    });
  }
}

export class InvalidRegionOrDCForScale extends NowError {
  constructor(regionOrDC) {
    super({
      code: 'INVALID_REGION_OR_DC_FOR_SCALE',
      meta: { regionOrDC },
      message: `Invalid region or DC "${regionOrDC}" provided`
    });
  }
}
