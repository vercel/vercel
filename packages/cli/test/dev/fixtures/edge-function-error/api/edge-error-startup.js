export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  // this should never be executed
  return new Response('some response body');
}

throw new Error('intentional startup error');
