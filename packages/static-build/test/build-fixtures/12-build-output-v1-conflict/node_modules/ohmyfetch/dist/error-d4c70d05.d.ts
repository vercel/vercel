declare type Fetch = typeof globalThis.fetch;
declare type RequestInfo = globalThis.RequestInfo;
declare type RequestInit = globalThis.RequestInit;
declare type Response = globalThis.Response;

interface ResponseMap {
    blob: Blob;
    text: string;
    arrayBuffer: ArrayBuffer;
}
declare type ResponseType = keyof ResponseMap | 'json';
declare type MappedType<R extends ResponseType, JsonType = any> = R extends keyof ResponseMap ? ResponseMap[R] : JsonType;

interface CreateFetchOptions {
    defaults?: FetchOptions;
    fetch: Fetch;
    Headers: typeof Headers;
}
declare type FetchRequest = RequestInfo;
interface FetchResponse<T> extends Response {
    _data?: T;
}
interface SearchParams {
    [key: string]: any;
}
interface FetchContext<T = any, R extends ResponseType = ResponseType> {
    request: FetchRequest;
    options: FetchOptions<R>;
    response?: FetchResponse<T>;
    error?: Error;
}
interface FetchOptions<R extends ResponseType = ResponseType> extends Omit<RequestInit, 'body'> {
    baseURL?: string;
    body?: RequestInit['body'] | Record<string, any>;
    params?: SearchParams;
    parseResponse?: (responseText: string) => any;
    responseType?: R;
    response?: boolean;
    retry?: number | false;
    onRequest?(ctx: FetchContext): Promise<void>;
    onRequestError?(ctx: FetchContext & {
        error: Error;
    }): Promise<void>;
    onResponse?(ctx: FetchContext & {
        response: FetchResponse<R>;
    }): Promise<void>;
    onResponseError?(ctx: FetchContext & {
        response: FetchResponse<R>;
    }): Promise<void>;
}
interface $Fetch {
    <T = any, R extends ResponseType = 'json'>(request: FetchRequest, opts?: FetchOptions<R>): Promise<MappedType<R, T>>;
    raw<T = any, R extends ResponseType = 'json'>(request: FetchRequest, opts?: FetchOptions<R>): Promise<FetchResponse<MappedType<R, T>>>;
    create(defaults: FetchOptions): $Fetch;
}
declare function createFetch(globalOptions: CreateFetchOptions): $Fetch;

declare class FetchError<T = any> extends Error {
    name: 'FetchError';
    request?: FetchRequest;
    response?: FetchResponse<T>;
    data?: T;
}
declare function createFetchError<T = any>(request: FetchRequest, error?: Error, response?: FetchResponse<T>): FetchError<T>;

export { $Fetch as $, CreateFetchOptions as C, FetchRequest as F, SearchParams as S, FetchResponse as a, FetchContext as b, FetchOptions as c, createFetch as d, FetchError as e, createFetchError as f };
