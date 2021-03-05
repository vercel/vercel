module.exports = (_, resp) => {
  resp.writeHead(401, { 'content-length': 2 });
  resp.end();
};
