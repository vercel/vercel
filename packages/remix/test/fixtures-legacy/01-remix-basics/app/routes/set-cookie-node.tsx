import type { LoaderFunction } from '@remix-run/server-runtime';

export const loader: LoaderFunction = () => {
    const headers = new Headers();
    headers.append('Set-Cookie', 'hello=world');
    headers.append('Set-Cookie', 'foo=bar');
    return new Response(null, { headers });
};
