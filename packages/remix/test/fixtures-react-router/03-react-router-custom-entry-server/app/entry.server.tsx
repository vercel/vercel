import { handleRequest } from '@vercel/react-router/entry.server';
import type { AppLoadContext, EntryContext } from 'react-router';

export default async function (
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext?: AppLoadContext,
): Promise<Response> {
    const nonce = 'MY_SUPER_SECRET_NONCE';
    const res = await handleRequest(
        request,
        responseStatusCode,
        responseHeaders,
        routerContext,
        loadContext,
        { nonce },
    );
    res.headers.set('Content-Security-Policy', `script-src 'nonce-${nonce}'`);
    return res;
}
