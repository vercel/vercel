export function GET() {
  return new Response(process.env.VERCEL_ANALYTICS_ID ? 'VERCEL_ANALYTICS_ID is set' : 'VERCEL_ANALYTICS_ID is not set')
}
