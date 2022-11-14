export const config = {
  matcher: ['/about/:path*', '/dashboard/:path*'],
};

export default () => new Response('middleware');
