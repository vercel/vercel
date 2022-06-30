// Supports both a single string value or an array of matchers
export const config = {
  matcher: ['/about/:path*', '/dashboard/:path*'],
};

export default function middleware(request, _event) {
  const response = new Response('middleware response');

  // Set custom header
  response.headers.set('x-modified-edge', 'true');

  return response;
}
