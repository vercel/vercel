export const config = {
  runtime: 'experimental-edge',
};

export default req => {
  return new Response(`RANDOMNESS_PLACEHOLDER:edge`);
};
