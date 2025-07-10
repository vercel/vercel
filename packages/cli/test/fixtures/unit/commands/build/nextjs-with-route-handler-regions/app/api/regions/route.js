export const preferredRegion = 'iad1';

export async function GET() {
  return new Response(preferredRegion);
}