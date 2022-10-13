export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request: Request, event: Event) {
  return new Response('heyo');
}
