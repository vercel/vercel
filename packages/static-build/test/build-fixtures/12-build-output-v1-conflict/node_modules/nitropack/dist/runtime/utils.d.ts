import type { CompatibilityEvent } from 'h3';
export declare function requestHasBody(request: globalThis.Request): boolean;
export declare function useRequestBody(request: globalThis.Request): Promise<any>;
export declare function hasReqHeader(req: CompatibilityEvent['req'], header: string, includes: string): boolean;
export declare function isJsonRequest(event: CompatibilityEvent): any;
export declare function normalizeError(error: any): {
    stack: {
        text: string;
        internal: boolean;
    }[];
    statusCode: any;
    statusMessage: any;
    message: any;
};
