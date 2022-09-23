export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  // TODO: fails in dev
  const importMetaUrl = import.meta.url;
  const url5 = new URL('file5.png', importMetaUrl);

  return new Response(
    JSON.stringify({
      url5,
    })
  );
}
