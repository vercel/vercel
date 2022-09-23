export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  const url1 = new URL('./file1.png', import.meta.url);

  return new Response(
    JSON.stringify({
      url1,
    })
  );
}
