export interface Response {
    statusCode: number;
    headers?: {
        [header: string]: boolean | number | string;
    };
    multiValueHeaders?: {
        [header: string]: ReadonlyArray<boolean | number | string>;
    };
    body?: string;
    isBase64Encoded?: boolean;
}
export interface BuilderResponse extends Response {
    ttl?: number;
}
