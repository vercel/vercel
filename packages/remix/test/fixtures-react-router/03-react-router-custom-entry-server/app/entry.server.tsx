import { handleRequest } from '@vercel/react-router/entry.server';
import type { AppLoadContext, EntryContext } from 'react-router';

export default function (
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext?: AppLoadContext,
): Promise<Response> {
    const nonce = 'MY_SUPER_SECRET_NONCE';
    return handleRequest(
        request,
        responseStatusCode,
        responseHeaders,
        routerContext,
        loadContext,
        { nonce },
    );
}
