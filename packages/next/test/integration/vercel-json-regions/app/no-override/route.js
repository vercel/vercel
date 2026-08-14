export const dynamic = 'force-dynamic';
export const preferredRegion = ['sin1'];
export const regions = ['hnd1'];

export function GET() {
  return new Response('Hello from no-override route');
}
