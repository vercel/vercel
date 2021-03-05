module.exports = (_, resp) => {
  resp.writeHead(401, { 'content-length': 4242 });
  resp.end(`${process.env.RANDOMNESS_ENV_VAR}:content-length`);
};
