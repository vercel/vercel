export default req => {
  return new Response(process.env.ENV_VAR_SHOULD_BE_DEFINED);
};
