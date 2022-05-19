export function middleware(request) {
  const url = request.nextUrl;

  if (url.pathname === '/dynamic/greet') {
    return new Response(
      JSON.stringify({
        message: url.searchParams.get('greeting') || 'Hi friend',
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
