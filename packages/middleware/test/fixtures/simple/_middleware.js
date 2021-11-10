export default req => {
  if (req.url === 'http://google.com') {
    return new Response('Hi from the edge!');
  }
};
