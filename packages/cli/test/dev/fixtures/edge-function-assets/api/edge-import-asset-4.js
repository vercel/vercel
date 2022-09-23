export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  const url4 = new URL('file4.png', 'https://example.com');

  return new Response(
    JSON.stringify({
      url4,
    })
  );
}
