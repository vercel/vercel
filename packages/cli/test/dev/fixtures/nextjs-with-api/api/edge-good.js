export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  return new Response(
    JSON.stringify({
      hello: 'world',
    })
  );
}
