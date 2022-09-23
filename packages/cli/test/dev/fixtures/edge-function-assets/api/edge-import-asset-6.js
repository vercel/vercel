export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  // TODO: fails in dev and prod
  const importMeta = import.meta;
  const url6 = new URL('file6.png', importMeta.url);

  return new Response(
    JSON.stringify({
      url6,
    })
  );
}
