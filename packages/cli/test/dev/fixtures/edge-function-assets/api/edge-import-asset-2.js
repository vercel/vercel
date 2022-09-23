export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  // TODO: fails to build in production, but works in `vc dev`
  // const url2 = new URL("file2.png", import.meta.url);

  const url2 = 'BROKEN';

  return new Response(
    JSON.stringify({
      url2,
    })
  );
}
