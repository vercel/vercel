export default (_req, res) => {
  res.setHeader('x-hello', 'world');
  res.send('Hello, world!').end();
};
