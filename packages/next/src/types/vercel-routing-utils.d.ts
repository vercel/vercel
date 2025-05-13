declare module '@vercel/routing-utils' {
  export interface HasField {
    type: string;
    key: string;
    value?: string;
    [key: string]: any;
  }

  export interface Header {
    key: string;
    value: string;
  }

  export interface Rewrite {
    source: string;
    destination: string;
    has?: HasField[];
    missing?: HasField[];
    locale?: {
      redirect?: Record<string, string>;
      cookie?: string;
    };
  }

  export interface RouteWithSrc {
    src: string;
    dest?: string;
    headers?: Record<string, string>;
    methods?: string[];
    continue?: boolean;
    check?: boolean;
    status?: number;
    has?: HasField[];
    missing?: HasField[];
    locale?: {
      redirect?: Record<string, string>;
      cookie?: string;
    };
  }

  export interface Route extends RouteWithSrc {
    handle?: string;
  }
}
