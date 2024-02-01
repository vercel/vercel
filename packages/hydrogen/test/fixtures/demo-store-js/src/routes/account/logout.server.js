export async function api(request, {session}) {
  if (request.method !== 'POST') {
    return new Response('Post required to logout', {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    });
  }

  if (!session) {
    return new Response('Session storage not available.', {
      status: 400,
    });
  }

  await session.set('customerAccessToken', '');

  return new Response();
}
