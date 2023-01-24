export const config = {
  runtime: 'edge',
};

export default req => {
  return new Response(`RANDOMNESS_PLACEHOLDER:edge`);
};
