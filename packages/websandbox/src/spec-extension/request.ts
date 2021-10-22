import type { IResult } from 'ua-parser-js';
import cookie from 'cookie';
import parseua from 'ua-parser-js';

export const INTERNALS = Symbol('internal request');

export class NextRequest extends Request {
  [INTERNALS]: {
    cookieParser(): { [key: string]: string };
    geo: { city?: string; country?: string; region?: string };
    ip?: string;
    page?: { name?: string; params?: { [key: string]: string } };
    ua?: IResult | null;
    url: URL;
  };

  constructor(input: Request | string, init: RequestInit = {}) {
    super(input, init);

    const cookieParser = () => {
      const value = this.headers.get('cookie');
      return value ? cookie.parse(value) : {};
    };

    this[INTERNALS] = {
      cookieParser,
      geo: init.geo || {},
      ip: init.ip,
      page: init.page,
      url: new URL(typeof input === 'string' ? input : input.url),
    };
  }

  public get cookies() {
    return this[INTERNALS].cookieParser();
  }

  public get geo() {
    return this[INTERNALS].geo;
  }

  public get ip() {
    return this[INTERNALS].ip;
  }

  public get preflight() {
    return this.headers.get('x-middleware-preflight');
  }

  public get nextUrl() {
    return this[INTERNALS].url;
  }

  public get page() {
    return {
      name: this[INTERNALS].page?.name,
      params: this[INTERNALS].page?.params,
    };
  }

  public get ua() {
    if (typeof this[INTERNALS].ua !== 'undefined') {
      return this[INTERNALS].ua || undefined;
    }

    const uaString = this.headers.get('user-agent');
    if (!uaString) {
      this[INTERNALS].ua = null;
      return this[INTERNALS].ua || undefined;
    }

    this[INTERNALS].ua = {
      ...parseua(uaString),
      // isBot: isBot(uaString),
    };

    return this[INTERNALS].ua;
  }

  public get url() {
    return this[INTERNALS].url.toString();
  }
}

export interface RequestInit extends globalThis.RequestInit {
  geo?: {
    city?: string;
    country?: string;
    region?: string;
  };
  ip?: string;
  page?: {
    name?: string;
    params?: { [key: string]: string };
  };
}

// interface UserAgent extends IResult {
//   isBot: boolean
// }
