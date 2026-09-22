export const dynamic = 'force-dynamic';

export default async function BackendFromEnvPage() {
  const serviceUrl = process.env.BACKEND_URL;

  let response = 'backend-status:missing';

  if (serviceUrl) {
    try {
      const res = await fetch(`${serviceUrl}/health`, { cache: 'no-store' });
      const body = await res.json();
      response = `backend-status:${body.status || 'unknown'}`;
    } catch {
      response = 'backend-status:error';
    }
  }

  return `service-url:${serviceUrl || 'missing'} ${response}`;
}
