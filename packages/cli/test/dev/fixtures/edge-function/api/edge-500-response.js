export const config = {
  runtime: 'edge',
};

export default async function edge(request, event) {
  return new Response('responding with intentional 500 from user code', {
    status: 500,
  });
}
