declare const fetch: {
    (input: RequestInfo, init?: RequestInit): Promise<Response>;
    Promise: PromiseConstructor;
    isRedirect: (code: number) => boolean;
};
export declare const Headers: {
    new (init?: HeadersInit): Headers;
    prototype: Headers;
};
export declare const Request: {
    new (input: RequestInfo, init?: RequestInit): Request;
    prototype: Request;
};
export declare const Response: {
    new (body?: BodyInit, init?: ResponseInit): Response;
    prototype: Response;
    error(): Response;
    redirect(url: string | URL, status?: number): Response;
};
export declare const FetchError: ErrorConstructor;
export declare const AbortError: ErrorConstructor;
export declare const isRedirect: (code: number) => boolean;
export default fetch;
