export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  const url0 = new URL('../assets/file0.png', import.meta.url);

  return new Response(
    JSON.stringify({
      url0,
    })
  );
}
