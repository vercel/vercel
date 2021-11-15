import type { CookieSerializeOptions } from 'cookie';
import cookie from 'cookie';
import { Response, ResponseInit as NodeFetchResponseInit } from 'node-fetch';

const INTERNALS = Symbol('internal response');
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export class SpecResponse extends Response {
  [INTERNALS]: {
    cookieParser(): { [key: string]: string };
    url?: URL;
  };

  constructor(body?: BodyInit | null, init: ResponseInit = {}) {
    // TODO - why is this failing?
    // @ts-ignore
    super(body, init);

    const cookieParser = () => {
      const value = this.headers.get('cookie');
      return value ? cookie.parse(value) : {};
    };

    this[INTERNALS] = {
      cookieParser,
      url: init.url ? new URL(init.url) : undefined,
    };
  }

  public get cookies() {
    return this[INTERNALS].cookieParser();
  }

  public cookie(
    name: string,
    value: { [key: string]: any } | string,
    opts: CookieSerializeOptions = {}
  ) {
    const val =
      typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value);

    if (opts.maxAge) {
      opts.expires = new Date(Date.now() + opts.maxAge);
      opts.maxAge /= 1000;
    }

    if (opts.path == null) {
      opts.path = '/';
    }

    this.headers.append(
      'Set-Cookie',
      cookie.serialize(name, String(val), opts)
    );
    return this;
  }

  public clearCookie(name: string, opts: CookieSerializeOptions = {}) {
    return this.cookie(name, '', { expires: new Date(1), path: '/', ...opts });
  }

  static redirect(url: string | URL, status = 302) {
    if (!REDIRECTS.has(status)) {
      throw new RangeError(
        'Failed to execute "redirect" on "response": Invalid status code'
      );
    }

    return new SpecResponse(null, {
      headers: { Location: typeof url === 'string' ? url : url.toString() },
      status,
    });
  }

  static rewrite(destination: string | URL) {
    return new SpecResponse(null, {
      headers: {
        'x-middleware-rewrite':
          typeof destination === 'string'
            ? destination
            : destination.toString(),
      },
    });
  }

  static next() {
    return new SpecResponse(null, {
      headers: {
        'x-middleware-next': '1',
      },
    });
  }
}

interface ResponseInit extends NodeFetchResponseInit {
  url?: string;
}
