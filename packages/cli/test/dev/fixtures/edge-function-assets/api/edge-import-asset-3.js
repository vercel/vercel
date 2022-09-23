export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  // TODO: fails in dev and prod
  const url3 = new URL('file3.png');

  return new Response(
    JSON.stringify({
      url3,
    })
  );
}
