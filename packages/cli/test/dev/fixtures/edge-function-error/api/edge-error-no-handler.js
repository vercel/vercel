export const config = {
  runtime: 'experimental-edge',
};

export async function notTheDefaultExport(request, event) {
  // this will never be run
  return new Response('some response body');
}
