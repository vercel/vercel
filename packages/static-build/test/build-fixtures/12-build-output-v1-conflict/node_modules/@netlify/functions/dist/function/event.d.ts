interface EventHeaders {
    [name: string]: string | undefined;
}
interface EventMultiValueHeaders {
    [name: string]: string[] | undefined;
}
interface EventQueryStringParameters {
    [name: string]: string | undefined;
}
interface EventMultiValueQueryStringParameters {
    [name: string]: string[] | undefined;
}
export interface Event {
    rawUrl: string;
    rawQuery: string;
    path: string;
    httpMethod: string;
    headers: EventHeaders;
    multiValueHeaders: EventMultiValueHeaders;
    queryStringParameters: EventQueryStringParameters | null;
    multiValueQueryStringParameters: EventMultiValueQueryStringParameters | null;
    body: string | null;
    isBase64Encoded: boolean;
}
export {};
