declare module 'serve-handler' {
  import http from 'http';

  export default function (
    request: http.IncomingMessage,
    response: http.ServerResponse,
    options: serveHandler.Options
  ): void;
}

declare namespace serveHandler {
  interface Options {
    public?: string;
    cleanUrls?: boolean;
    rewrites?: RewriteConfig[];
    redirects?: RedirectConfig[];
    headers?: HeaderConfig[];
    directoryListing?: boolean | string[];
    unlisted?: string[];
    trailingSlash?: boolean;
    renderSingle?: boolean;
    etag?: boolean;
  }

  interface RewriteConfig {
    source: string;
    destination: string;
  }

  interface RedirectConfig extends RewriteConfig {
    type: number;
  }

  interface HeaderConfig {
    source: string;
    headers: {
      [key: string]: string;
    }[];
  }
}

declare module 'serve-handler/src/directory' {
  interface File {
    relative: string;
    title: string;
    type: string;
    ext: string;
    base: string;
  }

  interface Path {
    name: string;
    url: string;
  }

  interface Spec {
    files?: File[];
    paths?: Path[];
    directory: string;
  }

  export default function (spec: Spec): string;
}
