// A service entrypoint that opts into the Edge Runtime via the in-file config
// export. The Node service builder used to silently ignore this and ship a Node
// lambda; it must now fail the build instead.
export const config = {
  runtime: 'edge',
};

export async function GET() {
  return new Response('hello from the edge');
}
