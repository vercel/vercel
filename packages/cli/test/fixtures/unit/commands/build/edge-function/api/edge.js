export const config = {
  runtime: 'experimental-edge',
};

export default req => new Response('from edge');
