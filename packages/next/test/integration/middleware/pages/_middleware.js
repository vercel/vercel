import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl;

  if (process.env.FOO) {
    console.log(`Includes env variable ${process.env.FOO}`);
  }

  if (url.pathname === '/next') {
    return NextResponse.next();
  }

  if (url.pathname === '/version') {
    return NextResponse.json({
      enumerable: Object.keys(self).includes('VercelRuntime'),
      version: self.VercelRuntime.version,
    });
  }

  if (url.pathname === '/globals') {
    const globalThisKeys = Object.keys(globalThis);
    const globalKeys = globalThisKeys.reduce((acc, globalName) => {
      const key = globalName.toString();
      if (global[key]) acc.push(key);
      return acc;
    }, []);

    return new NextResponse(
      JSON.stringify({ globals: globalKeys, globalThis: globalThisKeys }),
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      }
    );
  }

  if (url.pathname === '/log') {
    console.log('hi there');
    return;
  }

  if (url.pathname === '/logs') {
    console.clear();
    for (let i = 0; i < 3; i++) console.count();
    console.count('test');
    console.count('test');
    console.dir({ hello: 'world' });
    console.log('hello');
    console.log('world');
    return;
  }

  if (url.pathname === '/greetings') {
    const data = { message: 'hello world!' };
    return new NextResponse(JSON.stringify(data), {
      headers: {
        'x-example': 'edge',
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }

  if (url.pathname === '/rewrite-me-to-about') {
    url.pathname = '/about';
    url.searchParams.set('middleware', 'foo');
    return NextResponse.rewrite(url);
  }

  if (url.pathname === '/redirect-me-to-about') {
    url.pathname = '/about';
    url.searchParams.set('middleware', 'foo');
    return Response.redirect(url);
  }

  if (url.pathname === '/rewrite-absolute') {
    return NextResponse.rewrite('https://example.vercel.sh/foo?foo=bar');
  }

  if (url.pathname === '/rewrite-relative') {
    url.pathname = '/foo';
    url.searchParams.set('foo', 'bar');
    return NextResponse.rewrite(url);
  }

  if (url.pathname === '/redirect-absolute') {
    return Response.redirect('https://vercel.com');
  }

  if (url.pathname === '/redirect-301') {
    url.pathname = '/greetings';
    return Response.redirect(url, 301);
  }

  if (url.pathname === '/reflect') {
    return new Response(
      JSON.stringify({
        geo: request.geo,
        headers: Object.fromEntries(request.headers),
        ip: request.ip,
        method: request.method,
        nextUrl: {
          hash: request.nextUrl.hash,
          hostname: request.nextUrl.hostname,
          pathname: request.nextUrl.pathname,
          port: request.nextUrl.port,
          protocol: request.nextUrl.protocol,
          search: request.nextUrl.search,
        },
        url: request.url,
      }),
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      }
    );
  }

  if (url.pathname === '/stream-response') {
    const { readable, writable } = new TransformStream();
    const waitUntil = (async () => {
      const enc = new TextEncoder();
      const writer = writable.getWriter();
      writer.write(enc.encode('this is a streamed '));
      writer.write(enc.encode('response '));
      return writer.close();
    })();

    return {
      waitUntil,
      response: new NextResponse(readable),
    };
  }

  if (url.pathname === '/throw-error') {
    const error = new Error('oh no!');
    console.log('This is not worker.js');
    console.error(error);
    return new Promise((_, reject) => reject(error));
  }

  if (url.pathname === '/throw-error-internal') {
    function myFunctionName() {
      throw new Error('Oh no!');
    }

    function anotherFunction() {
      return myFunctionName();
    }

    try {
      anotherFunction();
    } catch (err) {
      console.error(err);
    }

    return new Promise((_, reject) => reject(new Error('oh no!')));
  }

  if (url.pathname === '/unhandledrejection') {
    Promise.reject(new TypeError('captured unhandledrejection error.'));
    return new NextResponse('OK');
  }
}
