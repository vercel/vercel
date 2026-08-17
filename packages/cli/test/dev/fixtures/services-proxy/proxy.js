export default function proxy(request) {
  const url = new URL(request.url);
  if (url.pathname === '/from-proxy') {
    return new Response('hi from proxy');
  }
  // Fall through to the routed service.
}
