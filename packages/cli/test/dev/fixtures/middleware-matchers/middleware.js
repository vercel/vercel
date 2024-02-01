// Supports both a single string value or an array of matchers
export const config = {
  matcher: ['/about/:path*', '/dashboard/:path*'],
};

export default function middleware(request, _event) {
  const url = new URL(request.url);

  const response = new Response(
    JSON.stringify({
      pathname: url.pathname,
      search: url.search,
      fromMiddleware: true,
    })
  );

  // Set custom header
  response.headers.set('x-modified-edge', 'true');

  return response;
}
