export const config = {
  runtime: 'experimental-edge',
};

export default async function handler() {
  return new Response('Hello World!');
}
