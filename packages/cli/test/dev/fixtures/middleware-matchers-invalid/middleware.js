export const config = {
  matcher: 'not-a-valid-matcher',
};

export default function middleware(request, _event) {
  return new Response(null);
}
