import { IncomingMessage, ServerResponse } from 'http';

interface ServePlaceholderOptions {
    /**
     * Sets `statusCode` for all handled responses. Set to `false` to disable overriding statusCode.
     *
     * @default 404
     */
    statusCode?: number;
    /**
     * Skip middleware when no handler is defined for the current request.
     * Please note that if this option is set to `true`, then `default` handler will be disabled
     *  @default false
    */
    skipUnknown?: boolean;
    /**
     * Set headers to prevent accidentally caching 404 resources.
     *
     * @default true
     */
    cacheHeaders?: boolean;
    /**
     * Sets an `X-Placeholder` header with value of handler name.
     *
     * @default true
     */
    placeholderHeader?: boolean;
    /**
     * A mapping from file extensions to the handler. Extensions should start with *dot* like `.js`.
     * You can disable any of the handlers by setting the value to `null`
     * If the value of a handler is set to `false`, the middleware will be ignored for that extension.
     */
    handlers?: Record<string, string | false>;
    /**
     * A mapping from handler to placeholder. Values can be `String` or `Buffer`. You can disable any of the placeholders by setting the value to `false`.
     */
    placeholders?: Record<string, string | undefined>;
    /**
     * A mapping from handler to the mime type. Mime type will be set as `Content-Type` header. You can disable sending any of the mimes by setting the value to `false`.
     */
    mimes?: Record<string, string | undefined>;
}

declare type ServerMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
declare function servePlaceholder(_options?: ServePlaceholderOptions): ServerMiddleware;

export { ServerMiddleware, servePlaceholder };
