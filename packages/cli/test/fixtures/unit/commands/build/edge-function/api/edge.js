export const config = {
  runtime: 'edge',
};

export default req => new Response('from edge');
